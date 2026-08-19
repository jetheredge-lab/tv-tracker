import { Request, Response } from 'express';
import movieService, { TmdbMovieSummary } from '../services/movies.js';
import movieCatalogService from '../services/movieCatalog.js';
import { normalizeTmdbMovieGenres } from '../services/genres.js';
import { tmdbImage, POSTER_SIZE, BACKDROP_SIZE } from '../services/tmdbClient.js';

const TRENDING_LIMIT = 24;

/**
 * Shaped to match the show payload field for field, so one card component in
 * the client renders either. `tvmazeId` is explicitly null rather than absent -
 * the client uses it to tell the two apart.
 */
const toMovieResult = (m: TmdbMovieSummary) => ({
  mediaType: 'MOVIE' as const,
  tvmazeId: null,
  tmdbId: m.id,
  title: m.title,
  summary: m.overview || '',
  posterUrl: tmdbImage(m.poster_path, POSTER_SIZE),
  backdropUrl: tmdbImage(m.backdrop_path, BACKDROP_SIZE),
  status: 'Released',
  genres: normalizeTmdbMovieGenres(m.genre_ids),
  network: null,
  premiered: m.release_date || null,
  releaseDate: m.release_date || null,
  rating: typeof m.vote_average === 'number' ? m.vote_average : null,
});

export const searchMovies = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      res.json({ results: [] });
      return;
    }
    const results = await movieService.searchMovies(query);
    res.json({ results: results.map(toMovieResult) });
  } catch (error) {
    console.error('[moviesController] searchMovies error:', error);
    res.status(500).json({ error: 'Failed to search movies', message: (error as Error).message });
  }
};

/**
 * Scored from the local catalog, never from a hardcoded list - the same lesson
 * the Explore tab's trending row had to learn.
 */
export const getTrendingMovies = async (_req: Request, res: Response): Promise<void> => {
  try {
    await movieCatalogService.ensureLoaded();
    const pool = movieCatalogService.getPool();
    if (pool.length === 0) {
      console.warn('[moviesController] movie catalog is empty - run `npm run catalog:sync-movies`');
      res.json({ results: [] });
      return;
    }

    const currentYear = new Date().getUTCFullYear();
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

    const scored = [...pool]
      .filter(c => c.posterUrl !== null)
      .map(c => {
        const recency = c.releaseYear ? clamp(1 - (currentYear - c.releaseYear) / 8, 0, 1) : 0;
        const quality = c.rating !== null ? clamp((c.rating - 6) / 2, -0.5, 1) : 0;
        // Popularity is unbounded and heavily skewed, so it is compressed
        // rather than used raw - otherwise one blockbuster buries the row.
        const popularity = Math.log10(Math.max(c.popularity, 1)) / 3;
        return { c, score: popularity + 0.9 * quality + 1.1 * recency };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TRENDING_LIMIT);

    const summaries = await movieCatalogService.getSummaries(scored.map(s => s.c.tmdbId));

    res.json({
      results: scored.map(({ c }) => ({
        mediaType: 'MOVIE' as const,
        tvmazeId: null,
        tmdbId: c.tmdbId,
        title: c.title,
        summary: summaries.get(c.tmdbId) || '',
        posterUrl: c.posterUrl,
        backdropUrl: c.backdropUrl,
        status: 'Released',
        genres: c.genres,
        network: null,
        premiered: c.releaseDate,
        releaseDate: c.releaseDate,
        rating: c.rating,
        runtime: c.runtime,
      })),
    });
  } catch (error) {
    console.error('[moviesController] getTrendingMovies error:', error);
    res.status(500).json({ error: 'Failed to fetch trending movies' });
  }
};

export const getMovieDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if (Number.isNaN(tmdbId)) {
      res.status(400).json({ error: 'A numeric TMDB id is required' });
      return;
    }

    const movie = await movieService.syncMovieWithDb(tmdbId);
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({ show: movie });
  } catch (error) {
    console.error('[moviesController] getMovieDetails error:', error);
    res.status(500).json({ error: 'Failed to fetch movie details', message: (error as Error).message });
  }
};
