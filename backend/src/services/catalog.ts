import axios from 'axios';
import prisma from './prisma.js';
import { TVmazeShow } from '../types/index.js';
import { stripHtml } from './tvmaze.js';

const TVMAZE_BASE_URL = 'https://api.tvmaze.com';

// TVmaze paginates its whole show index 250 at a time and 404s past the end.
// ~390 pages / ~90k shows as of 2026. The index is the only keyless source
// rich enough to recommend from - it carries genres, network, rating and
// TVmaze's own 0-100 popularity `weight`.
const PAGE_SIZE_HINT = 250;
const MAX_PAGES = 600;
const PAGE_DELAY_MS = 120;
const SUMMARY_MAX = 400;

/**
 * Lean projection held in memory for scoring. Deliberately excludes summaries -
 * those are fetched only for the handful of shows actually returned.
 */
export interface CandidateShow {
  /**
   * Stable identity across both catalogues. TVmaze and TMDB number titles
   * independently, so a bare id cannot key a mixed pool - tvmaze 550 and tmdb
   * 550 are different titles entirely.
   */
  key: string;
  mediaType: 'TV' | 'MOVIE';
  /** Null for films. */
  tvmazeId: number | null;
  tmdbId: number | null;
  title: string;
  genres: string[];
  network: string | null;
  webChannel: string | null;
  provider: string | null; // network ?? webChannel, for affinity matching
  language: string | null;
  type: string | null;
  status: string | null;
  premiered: string | null;
  premieredYear: number | null;
  ended: string | null;
  rating: number | null;
  weight: number;
  runtime: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
}

// A show only enters the in-memory pool if it clears one of these bars. This
// drops ~70k long-tail entries (local news, untranslated regional soaps, shows
// with no artwork) that would otherwise dominate a genre filter.
const POOL_MIN_WEIGHT = 45;
const POOL_MIN_RATING = 7.4;

const POOL_TTL_MS = 6 * 60 * 60 * 1000;

export class CatalogService {
  private pool: CandidateShow[] = [];
  private byTitle = new Map<string, CandidateShow[]>();
  private byTvmazeId = new Map<number, CandidateShow>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  /**
   * Mirror the entire TVmaze show index into `catalog_shows`.
   * Runs weekly from the scheduler and on demand via `npm run catalog:sync`.
   */
  async syncCatalog(opts: { maxPages?: number; onProgress?: (page: number, total: number) => void } = {}) {
    const maxPages = opts.maxPages ?? MAX_PAGES;
    const rows: any[] = [];
    let page = 0;

    for (; page < maxPages; page++) {
      let batch: TVmazeShow[] | null = null;
      try {
        const res = await axios.get<TVmazeShow[]>(`${TVMAZE_BASE_URL}/shows`, {
          params: { page },
          timeout: 20000,
          headers: { Accept: 'application/json', 'User-Agent': 'TVTracker/1.0' },
        });
        batch = res.data;
      } catch (err: any) {
        // 404 is the documented end-of-index marker.
        if (err?.response?.status === 404) break;
        // 429 = rate limited; back off once and retry the same page.
        if (err?.response?.status === 429) {
          await sleep(5000);
          page--;
          continue;
        }
        console.warn(`[CatalogService] page ${page} failed, stopping sync:`, err?.message || err);
        break;
      }

      if (!batch || batch.length === 0) break;

      for (const s of batch) {
        rows.push(toCatalogRow(s));
      }

      opts.onProgress?.(page, rows.length);
      await sleep(PAGE_DELAY_MS);
    }

    if (rows.length < PAGE_SIZE_HINT) {
      throw new Error(`Catalog sync aborted: only ${rows.length} shows fetched, refusing to replace the catalog`);
    }

    // Full replace inside one transaction so the table is never observed empty.
    await prisma.$transaction(
      async tx => {
        await tx.catalogShow.deleteMany({});
        for (let i = 0; i < rows.length; i += 1000) {
          await tx.catalogShow.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
        }
      },
      { timeout: 600000, maxWait: 30000 }
    );

    this.loadedAt = 0; // force a pool reload on the next request
    console.log(`[CatalogService] synced ${rows.length} shows from ${page} pages`);
    return rows.length;
  }

  async countShows(): Promise<number> {
    return prisma.catalogShow.count();
  }

  /**
   * Load (or refresh) the in-memory scoring pool.
   */
  async ensureLoaded(force = false): Promise<void> {
    if (!force && this.pool.length > 0 && Date.now() - this.loadedAt < POOL_TTL_MS) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const rows = await prisma.catalogShow.findMany({
        where: {
          posterUrl: { not: null },
          // "In Development" shows have never aired - recommending them just
          // offers the user something they cannot watch.
          status: { not: 'In Development' },
          AND: [
            { OR: [{ weight: { gte: POOL_MIN_WEIGHT } }, { rating: { gte: POOL_MIN_RATING } }] },
            // Announced-but-unaired titles carry a future premiere date.
            { OR: [{ premiered: null }, { premiered: { lte: new Date() } }] },
          ],
        },
        select: {
          tvmazeId: true,
          title: true,
          genres: true,
          network: true,
          webChannel: true,
          language: true,
          type: true,
          status: true,
          premiered: true,
          ended: true,
          rating: true,
          weight: true,
          runtime: true,
          posterUrl: true,
          backdropUrl: true,
        },
      });

      const pool: CandidateShow[] = rows.map(r => ({
        key: candidateKey('TV', r.tvmazeId, null),
        mediaType: 'TV' as const,
        tvmazeId: r.tvmazeId,
        tmdbId: null,
        title: r.title,
        genres: r.genres || [],
        network: r.network,
        webChannel: r.webChannel,
        provider: r.network || r.webChannel || null,
        language: r.language,
        type: r.type,
        status: r.status,
        premiered: r.premiered ? r.premiered.toISOString().slice(0, 10) : null,
        premieredYear: r.premiered ? r.premiered.getUTCFullYear() : null,
        ended: r.ended ? r.ended.toISOString().slice(0, 10) : null,
        rating: r.rating,
        weight: r.weight ?? 0,
        runtime: r.runtime,
        posterUrl: r.posterUrl,
        backdropUrl: r.backdropUrl,
      }));

      const byTitle = new Map<string, CandidateShow[]>();
      const byId = new Map<number, CandidateShow>();
      for (const c of pool) {
        if (c.tvmazeId !== null) byId.set(c.tvmazeId, c);
        const key = normalizeTitle(c.title);
        const bucket = byTitle.get(key);
        if (bucket) bucket.push(c);
        else byTitle.set(key, [c]);
      }

      this.pool = pool;
      this.byTitle = byTitle;
      this.byTvmazeId = byId;
      this.loadedAt = Date.now();
      console.log(`[CatalogService] scoring pool loaded: ${pool.length} shows`);
    })().finally(() => {
      this.loading = null;
    });

    return this.loading;
  }

  getPool(): CandidateShow[] {
    return this.pool;
  }

  get isEmpty(): boolean {
    return this.pool.length === 0;
  }

  findById(tvmazeId: number): CandidateShow | undefined {
    return this.byTvmazeId.get(tvmazeId);
  }

  /**
   * Resolve a plain title (e.g. from TMDB) to a catalog entry without an HTTP
   * round trip. Prefers the highest-weight match when titles collide.
   */
  findByTitle(title: string): CandidateShow | undefined {
    const bucket = this.byTitle.get(normalizeTitle(title));
    if (!bucket || bucket.length === 0) return undefined;
    if (bucket.length === 1) return bucket[0];
    return [...bucket].sort((a, b) => b.weight - a.weight)[0];
  }

  /**
   * Summaries for the shows actually being returned.
   */
  async getSummaries(tvmazeIds: number[]): Promise<Map<number, string>> {
    if (tvmazeIds.length === 0) return new Map();
    const rows = await prisma.catalogShow.findMany({
      where: { tvmazeId: { in: tvmazeIds } },
      select: { tvmazeId: true, summary: true },
    });
    return new Map(rows.map(r => [r.tvmazeId, r.summary || '']));
  }
}

function toCatalogRow(s: TVmazeShow & { weight?: number }) {
  return {
    tvmazeId: s.id,
    title: s.name,
    language: s.language || null,
    type: s.type || null,
    status: s.status || null,
    genres: s.genres || [],
    network: s.network?.name || null,
    webChannel: s.webChannel?.name || null,
    country: s.network?.country?.code || null,
    premiered: s.premiered ? new Date(s.premiered) : null,
    ended: s.ended ? new Date(s.ended) : null,
    rating: s.rating?.average ?? null,
    weight: typeof s.weight === 'number' ? s.weight : 0,
    runtime: s.averageRuntime ?? s.runtime ?? null,
    summary: stripHtml(s.summary).slice(0, SUMMARY_MAX) || null,
    posterUrl: s.image?.medium || s.image?.original || null,
    backdropUrl: s.image?.original || null,
  };
}

/** The one place the mixed-pool key format is defined. */
export function candidateKey(
  mediaType: 'TV' | 'MOVIE',
  tvmazeId: number | null | undefined,
  tmdbId: number | null | undefined
): string {
  return mediaType === 'MOVIE' ? `movie:${tmdbId}` : `tv:${tvmazeId}`;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const catalogService = new CatalogService();
export default catalogService;
