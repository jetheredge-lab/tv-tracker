import prisma from './prisma.js';
import { normalizeTmdbMovieGenres } from './genres.js';
import { refreshAvailability } from './availability.js';
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
/**
 * TMDB release-date types. A film has several dates and they are not
 * interchangeable: the cinema date and the streaming date are often months
 * apart, and for most viewers only the second one is actionable.
 */
const RELEASE_TYPE = {
  PREMIERE: 1,
  THEATRICAL_LIMITED: 2,
  THEATRICAL: 3,
  DIGITAL: 4,
  PHYSICAL: 5,
  TV: 6,
} as const;

interface TmdbReleaseDates {
  results: Array<{
    iso_3166_1: string;
    release_dates: Array<{ type: number; release_date: string }>;
  }>;
}

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
   * Cinema and streaming dates for one region, whichever TMDB knows.
   */
  async getReleaseDates(
    tmdbId: number,
    region = 'US'
  ): Promise<{ theatrical: Date | null; digital: Date | null }> {
    try {
      const data = await tmdbGet<TmdbReleaseDates>(`/movie/${tmdbId}/release_dates`);
      const block = data.results?.find(r => r.iso_3166_1 === region.toUpperCase());
      if (!block) return { theatrical: null, digital: null };

      /**
       * Types are tried in PRIORITY order, not merged and sorted by date.
       * Taking the earliest across all of them lets a festival premiere months
       * ahead of general release masquerade as "in cinemas" - which is when
       * almost nobody can actually go and see it.
       */
      const firstOfType = (typesByPriority: number[]): Date | null => {
        for (const type of typesByPriority) {
          const dates = block.release_dates
            .filter(d => d.type === type && d.release_date)
            .map(d => new Date(d.release_date))
            .filter(d => !Number.isNaN(d.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
          if (dates.length > 0) return dates[0];
        }
        return null;
      };

      return {
        theatrical: firstOfType([
          RELEASE_TYPE.THEATRICAL,
          RELEASE_TYPE.THEATRICAL_LIMITED,
          RELEASE_TYPE.PREMIERE,
        ]),
        // TV counts as "available at home" for anyone without a cinema ticket.
        digital: firstOfType([RELEASE_TYPE.DIGITAL, RELEASE_TYPE.TV]),
      };
    } catch (err) {
      console.warn(`[MovieService] release dates failed for ${tmdbId}:`, (err as Error).message);
      return { theatrical: null, digital: null };
    }
  }

  /**
   * Persist a film as a `Show` row with mediaType MOVIE - the same table shows
   * live in, which is what makes one unified watchlist possible.
   *
   * Streaming providers are deliberately NOT synced from the network -> provider
   * heuristic: it keys off a broadcast network and films have none. Real
   * per-region availability is written to title_availability instead.
   */
  async syncMovieWithDb(tmdbId: number, region = 'US') {
    const detail = await this.getMovieDetails(tmdbId);
    if (!detail) return null;

    const dates = await this.getReleaseDates(tmdbId, region);
    // detail.release_date is TMDB's primary date, which is region-agnostic;
    // the per-region theatrical date is the better answer when it exists.
    const releaseDate =
      dates.theatrical ?? (detail.release_date ? new Date(detail.release_date) : null);
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
      digitalReleaseDate: dates.digital,
      // `premiered` stays the TV field, but mirroring the release date into it
      // keeps every era/recency scorer working across both media unchanged.
      premiered: releaseDate,
      runtime: detail.runtime ?? null,
      rating: typeof detail.vote_average === 'number' ? detail.vote_average : null,
    };

    // Addressed by (mediaType, tmdbId): a bare tmdbId is ambiguous because
    // TMDB numbers films and series independently.
    const show = await prisma.show.upsert({
      where: { mediaType_tmdbId: { mediaType: 'MOVIE', tmdbId } },
      update: fields,
      create: { tmdbId, ...fields },
    });

    // Where to watch it, from the JustWatch feed. Enrichment, so a failure
    // here must not cost the caller the title itself.
    try {
      await refreshAvailability(
        { id: show.id, tmdbId: show.tmdbId, mediaType: 'MOVIE', title: show.title },
        region
      );
    } catch (err) {
      console.warn(`[MovieService] availability refresh failed for "${show.title}":`, (err as Error).message);
    }

    return prisma.show.findUnique({
      where: { id: show.id },
      include: { streamingProviders: true, availability: true },
    });
  }
}

export const movieService = new MovieService();
export default movieService;
