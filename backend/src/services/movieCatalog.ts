import axios, { AxiosInstance } from 'axios';
import prisma from './prisma.js';
import { normalizeTitle } from './catalog.js';
import { normalizeTmdbMovieGenres } from './genres.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const POSTER_SIZE = 'w500';
const BACKDROP_SIZE = 'w1280';

/**
 * TMDB caps ANY discover query at 500 pages / 10,000 results, so the corpus
 * cannot be walked in one sweep the way TVmaze's index can. The workaround is
 * to band by release year and union the bands.
 *
 * The daily export dump (files.tmdb.org) lists every movie id and is tempting,
 * but it carries no genres, poster or rating - filling those in would mean one
 * /movie/{id} call per title, tens of thousands of requests. /discover returns
 * all of it inline, twenty at a time, which is why the sweep is built this way.
 *
 * Recent years get more depth than 1953 because that is where attention is;
 * the tail still gets enough to satisfy an era or genre row.
 */
const FIRST_YEAR = 1950;
const RECENT_YEAR_COUNT = 20;
const PAGES_RECENT = 40; // 800 titles per year
const PAGES_OLDER = 10; // 200 titles per year
const MIN_VOTE_COUNT = 20; // drops unrated junk before it reaches the pool
const PAGE_DELAY_MS = 60;
const SUMMARY_MAX = 400;

/**
 * A film only enters the in-memory pool if it clears one of these. Same intent
 * as the TV pool's thresholds: keep a genre row from being swamped by the long
 * tail. Deliberately provisional - retune once a sweep shows the distribution.
 */
const POOL_MIN_POPULARITY = 3;
const POOL_MIN_RATING = 6.0;
const POOL_MIN_VOTES = 50;

const POOL_TTL_MS = 6 * 60 * 60 * 1000;

/** Lean projection held in memory for scoring; the film analogue of CandidateShow. */
export interface MovieCandidate {
  tmdbId: number;
  title: string;
  genres: string[];
  language: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  rating: number | null;
  voteCount: number;
  /** TMDB popularity - the movie analogue of TVmaze's 0-100 weight. */
  popularity: number;
  runtime: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

interface TmdbDiscoverMovie {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  adult?: boolean;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const imageUrl = (path: string | null | undefined, size: string): string | null =>
  path ? `${IMAGE_BASE}/${size}${path}` : null;

export class MovieCatalogService {
  private pool: MovieCandidate[] = [];
  private byTitle = new Map<string, MovieCandidate[]>();
  private byTmdbId = new Map<number, MovieCandidate>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  private client: AxiosInstance = axios.create({ baseURL: TMDB_BASE_URL, timeout: 15000 });

  // Read at call time, never at construction - this module is imported before
  // index.ts runs dotenv.config(), so a field initializer captures an empty env.
  private get apiKey(): string | null {
    return process.env.TMDB_API_KEY?.trim() || null;
  }

  private get accessToken(): string | null {
    return process.env.TMDB_ACCESS_TOKEN?.trim() || null;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey || this.accessToken);
  }

  private get headers() {
    const token = this.accessToken;
    return token
      ? { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      : { Accept: 'application/json' };
  }

  private params(extra: Record<string, unknown> = {}) {
    return this.accessToken ? extra : { api_key: this.apiKey, ...extra };
  }

  /**
   * Rebuild `catalog_movies` from TMDB.
   *
   * Unlike the TV catalog this CANNOT run without credentials: TVmaze publishes
   * a free index with its own popularity score, and there is no equivalent for
   * film. No key means no movies, loudly rather than silently.
   */
  async syncCatalog(
    opts: { onProgress?: (year: number, total: number) => void } = {}
  ): Promise<number> {
    if (!this.isConfigured) {
      throw new Error(
        'TMDB credentials are required to sync the movie catalog. Set TMDB_API_KEY (v3) ' +
          'or TMDB_ACCESS_TOKEN (v4) - unlike the TVmaze show index there is no keyless source.'
      );
    }

    const currentYear = new Date().getUTCFullYear();
    const lastYear = currentYear + 1; // titles dated slightly ahead do exist
    const rows = new Map<number, ReturnType<typeof toCatalogRow>>();

    for (let year = FIRST_YEAR; year <= lastYear; year++) {
      const deep = year > currentYear - RECENT_YEAR_COUNT;
      const maxPages = deep ? PAGES_RECENT : PAGES_OLDER;

      for (let page = 1; page <= maxPages; page++) {
        let batch: TmdbDiscoverMovie[] = [];
        let totalPages = 0;

        try {
          const res = await this.client.get<{
            results: TmdbDiscoverMovie[];
            total_pages: number;
          }>('/discover/movie', {
            params: this.params({
              sort_by: 'popularity.desc',
              primary_release_year: year,
              'vote_count.gte': MIN_VOTE_COUNT,
              include_adult: false,
              include_video: false,
              page,
            }),
            headers: this.headers,
          });
          batch = res.data.results ?? [];
          totalPages = res.data.total_pages ?? 0;
        } catch (err: any) {
          if (err?.response?.status === 429) {
            await sleep(3000);
            page--; // retry the same page
            continue;
          }
          console.warn(
            `[MovieCatalogService] ${year} page ${page} failed:`,
            err?.message || err
          );
          break;
        }

        if (batch.length === 0) break;
        for (const m of batch) rows.set(m.id, toCatalogRow(m));
        if (page >= totalPages) break;

        await sleep(PAGE_DELAY_MS);
      }

      opts.onProgress?.(year, rows.size);
    }

    // Same guard as the TV catalog: never replace a working table with a
    // truncated fetch because the network wobbled halfway through.
    if (rows.size < 1000) {
      throw new Error(
        `Movie catalog sync aborted: only ${rows.size} titles fetched, refusing to replace the catalog`
      );
    }

    const all = [...rows.values()];
    await prisma.$transaction(
      async tx => {
        await tx.catalogMovie.deleteMany({});
        for (let i = 0; i < all.length; i += 1000) {
          await tx.catalogMovie.createMany({ data: all.slice(i, i + 1000), skipDuplicates: true });
        }
      },
      { timeout: 600000, maxWait: 30000 }
    );

    this.loadedAt = 0; // force a pool reload
    console.log(`[MovieCatalogService] synced ${all.length} movies`);
    return all.length;
  }

  async countMovies(): Promise<number> {
    return prisma.catalogMovie.count();
  }

  /** Load (or refresh) the in-memory scoring pool. */
  async ensureLoaded(force = false): Promise<void> {
    if (!force && this.pool.length > 0 && Date.now() - this.loadedAt < POOL_TTL_MS) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const rows = await prisma.catalogMovie.findMany({
        where: {
          OR: [
            { popularity: { gte: POOL_MIN_POPULARITY } },
            { AND: [{ rating: { gte: POOL_MIN_RATING } }, { voteCount: { gte: POOL_MIN_VOTES } }] },
          ],
        },
        select: {
          tmdbId: true,
          title: true,
          genres: true,
          language: true,
          releaseDate: true,
          releaseYear: true,
          rating: true,
          voteCount: true,
          popularity: true,
          runtime: true,
          posterUrl: true,
          backdropUrl: true,
        },
      });

      const pool: MovieCandidate[] = rows.map(r => ({
        tmdbId: r.tmdbId,
        title: r.title,
        genres: r.genres,
        language: r.language,
        releaseDate: r.releaseDate ? r.releaseDate.toISOString().slice(0, 10) : null,
        releaseYear: r.releaseYear,
        rating: r.rating,
        voteCount: r.voteCount,
        popularity: r.popularity,
        runtime: r.runtime,
        posterUrl: r.posterUrl,
        backdropUrl: r.backdropUrl,
      }));

      const byTitle = new Map<string, MovieCandidate[]>();
      const byId = new Map<number, MovieCandidate>();
      for (const c of pool) {
        byId.set(c.tmdbId, c);
        const key = normalizeTitle(c.title);
        const bucket = byTitle.get(key);
        if (bucket) bucket.push(c);
        else byTitle.set(key, [c]);
      }

      this.pool = pool;
      this.byTitle = byTitle;
      this.byTmdbId = byId;
      this.loadedAt = Date.now();
      console.log(`[MovieCatalogService] scoring pool loaded: ${pool.length} movies`);
    })().finally(() => {
      this.loading = null;
    });

    return this.loading;
  }

  getPool(): MovieCandidate[] {
    return this.pool;
  }

  get isEmpty(): boolean {
    return this.pool.length === 0;
  }

  findById(tmdbId: number): MovieCandidate | undefined {
    return this.byTmdbId.get(tmdbId);
  }

  /** Highest-popularity match wins when titles collide (remakes, re-releases). */
  findByTitle(title: string): MovieCandidate | undefined {
    const bucket = this.byTitle.get(normalizeTitle(title));
    if (!bucket || bucket.length === 0) return undefined;
    if (bucket.length === 1) return bucket[0];
    return [...bucket].sort((a, b) => b.popularity - a.popularity)[0];
  }

  /** Summaries for the handful of titles actually being returned. */
  async getSummaries(tmdbIds: number[]): Promise<Map<number, string>> {
    if (tmdbIds.length === 0) return new Map();
    const rows = await prisma.catalogMovie.findMany({
      where: { tmdbId: { in: tmdbIds } },
      select: { tmdbId: true, summary: true },
    });
    return new Map(rows.map(r => [r.tmdbId, r.summary || '']));
  }
}

function toCatalogRow(m: TmdbDiscoverMovie) {
  const release = m.release_date && m.release_date.length >= 4 ? m.release_date : null;
  return {
    tmdbId: m.id,
    title: m.title,
    originalTitle: m.original_title || null,
    language: m.original_language || null,
    // Normalised at ingest so film and television share one vocabulary - see
    // services/genres.ts. /discover returns ids only, never names.
    genres: normalizeTmdbMovieGenres(m.genre_ids),
    releaseDate: release ? new Date(release) : null,
    releaseYear: release ? Number(release.slice(0, 4)) : null,
    rating: typeof m.vote_average === 'number' ? m.vote_average : null,
    voteCount: m.vote_count ?? 0,
    popularity: m.popularity ?? 0,
    // /discover does not carry runtime; it needs a per-title call. Left null and
    // hydrated only for titles actually rendered.
    runtime: null as number | null,
    summary: (m.overview || '').slice(0, SUMMARY_MAX) || null,
    posterUrl: imageUrl(m.poster_path, POSTER_SIZE),
    backdropUrl: imageUrl(m.backdrop_path, BACKDROP_SIZE),
    adult: Boolean(m.adult),
  };
}

export const movieCatalogService = new MovieCatalogService();
export default movieCatalogService;
