import prisma from './prisma.js';
import { normalizeTmdbMovieGenres } from './genres.js';
import { tmdbGet, tmdbImage, tmdbIsConfigured, POSTER_SIZE, BACKDROP_SIZE } from './tmdbClient.js';

const SUMMARY_MAX = 2000;

export interface TmdbMovieSummary {
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
}

interface TmdbMovieDetail extends Omit<TmdbMovieSummary, 'genre_ids'> {
  genres?: Array<{ id: number; name: string }>;
  runtime?: number | null;
  status?: string;
  tagline?: string;
}

/**
 * Films, the TVmaze-less half of the catalog.
 *
 * Unlike shows there is no keyless source, so every method here needs TMDB
 * credentials and says so plainly rather than degrading to something empty.
 */
export class MovieService {
  get isConfigured(): boolean {
    return tmdbIsConfigured();
  }

  private assertConfigured(): void {
    if (!this.isConfigured) {
      throw new Error(
        'TMDB credentials are required for movies. Set TMDB_API_KEY (v3) or TMDB_ACCESS_TOKEN (v4).'
      );
    }
  }

  async searchMovies(query: string): Promise<TmdbMovieSummary[]> {
    this.assertConfigured();
    if (!query.trim()) return [];
    const data = await tmdbGet<{ results: TmdbMovieSummary[] }>('/search/movie', {
      query: query.trim(),
      include_adult: false,
    });
    return data.results ?? [];
  }

  async getMovieDetails(tmdbId: number): Promise<TmdbMovieDetail | null> {
    this.assertConfigured();
    try {
      return await tmdbGet<TmdbMovieDetail>(`/movie/${tmdbId}`);
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Persist a film as a `Show` row with mediaType MOVIE - the same table shows
   * live in, which is what makes one unified watchlist possible.
   *
   * Deliberately does NOT sync streaming providers. The network -> provider
   * heuristic those come from keys off a broadcast network, and films have
   * none; real per-region availability lands in title_availability (phase 2).
   */
  async syncMovieWithDb(tmdbId: number, _region = 'US') {
    const detail = await this.getMovieDetails(tmdbId);
    if (!detail) return null;

    const releaseDate = detail.release_date ? new Date(detail.release_date) : null;
    const fields = {
      mediaType: 'MOVIE' as const,
      title: detail.title,
      summary: (detail.overview || '').slice(0, SUMMARY_MAX) || null,
      posterUrl: tmdbImage(detail.poster_path, POSTER_SIZE),
      backdropUrl: tmdbImage(detail.backdrop_path, BACKDROP_SIZE),
      status: detail.status || 'Released',
      genres: normalizeTmdbMovieGenres(detail.genres),
      network: null,
      releaseDate,
      // `premiered` stays the TV field, but mirroring the release date into it
      // keeps every era/recency scorer working across both media unchanged.
      premiered: releaseDate,
      runtime: detail.runtime ?? null,
      rating: typeof detail.vote_average === 'number' ? detail.vote_average : null,
    };

    const show = await prisma.show.upsert({
      where: { tmdbId },
      update: fields,
      create: { tmdbId, ...fields },
    });

    return prisma.show.findUnique({
      where: { id: show.id },
      include: { streamingProviders: true, availability: true },
    });
  }
}

export const movieService = new MovieService();
export default movieService;
