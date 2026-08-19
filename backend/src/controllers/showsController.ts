import { Request, Response } from 'express';
import tvmazeService, { stripHtml } from '../services/tvmaze.js';
import prisma from '../services/prisma.js';
import tmdbService from '../services/tmdb.js';
import watchmodeService from '../services/watchmode.js';
import catalogService from '../services/catalog.js';

export const searchShows = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length === 0) {
      res.json({ results: [] });
      return;
    }

    const shows = await tvmazeService.searchShows(query);
    const formatted = shows.map(s => ({
      tvmazeId: s.id,
      title: s.name,
      summary: stripHtml(s.summary),
      posterUrl: s.image?.medium || s.image?.original || null,
      backdropUrl: s.image?.original || null,
      status: s.status,
      genres: s.genres || [],
      network: s.network?.name || s.webChannel?.name || null,
      premiered: s.premiered,
      rating: s.rating?.average || null,
    }));

    res.json({ results: formatted });
  } catch (error) {
    console.error('[showsController] searchShows error:', error);
    res.status(500).json({ error: 'Failed to search shows', message: (error as Error).message });
  }
};

export const getShowDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tvmazeId = parseInt(id, 10);

    if (isNaN(tvmazeId)) {
      // Check by database UUID
      const dbShow = await prisma.show.findUnique({
        where: { id },
        include: {
          episodes: {
            orderBy: [{ season: 'asc' }, { number: 'asc' }],
          },
          streamingProviders: true,
        },
      });

      if (!dbShow) {
        res.status(404).json({ error: 'Show not found' });
        return;
      }

      res.json({ show: dbShow });
      return;
    }

    // Sync or fetch from TVmaze
    const show = await tvmazeService.syncShowWithDb(tvmazeId);
    if (!show) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }

    res.json({ show });
  } catch (error) {
    console.error('[showsController] getShowDetails error:', error);
    res.status(500).json({ error: 'Failed to fetch show details', message: (error as Error).message });
  }
};

/**
 * Explore's default row. Personalisation lives in /api/recommendations - this is
 * the anonymous "what is big right now" list, so it scores the whole TVmaze
 * catalog on its own popularity `weight` rather than naming shows in code.
 */
const TRENDING_LIMIT = 24;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const getTrendingShows = async (_req: Request, res: Response): Promise<void> => {
  try {
    await catalogService.ensureLoaded();
    const pool = catalogService.getPool();
    if (pool.length === 0) {
      console.warn('[showsController] catalog is empty - run `npm run catalog:sync`');
      res.json({ results: [] });
      return;
    }

    // TMDB is the only true week-over-week signal and it is optional. Without a
    // key, TVmaze's 0-100 weight carries the row on its own.
    const trendingRank = new Map<number, number>();
    try {
      const titles = await tmdbService.getTrendingTitles();
      titles.forEach((title, idx) => {
        const match = catalogService.findByTitle(title);
        if (match) trendingRank.set(match.tvmazeId, titles.length - idx);
      });
    } catch {
      // Enrichment only - the catalog ranking below stands on its own.
    }

    const currentYear = new Date().getUTCFullYear();

    const scored = pool
      .filter(c => {
        if (!c.posterUrl) return false;
        if (trendingRank.has(c.tvmazeId)) return true;
        if (c.weight < 88) return false;
        // A show that just wrapped is still "what everyone is watching";
        // one that ended a decade ago is not.
        if (c.status !== 'Ended') return true;
        const endedYear = c.ended ? Number(c.ended.slice(0, 4)) : null;
        return endedYear !== null && currentYear - endedYear <= 2;
      })
      .map(c => {
        const recency = c.premieredYear
          ? clamp(1 - (currentYear - c.premieredYear) / 12, 0, 1)
          : 0.3;
        const quality = c.rating !== null ? clamp((c.rating - 6.5) / 2, -0.5, 1) : 0;
        const trend = trendingRank.has(c.tvmazeId)
          ? 2.5 + trendingRank.get(c.tvmazeId)! / 40
          : 0;
        return { c, score: c.weight / 100 + 0.9 * quality + 0.8 * recency + trend };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TRENDING_LIMIT);

    const summaries = await catalogService.getSummaries(scored.map(s => s.c.tvmazeId));

    res.json({
      results: scored.map(({ c }) => ({
        tvmazeId: c.tvmazeId,
        title: c.title,
        summary: summaries.get(c.tvmazeId) || '',
        posterUrl: c.posterUrl,
        backdropUrl: c.backdropUrl,
        status: c.status,
        genres: c.genres,
        network: c.provider,
        premiered: c.premiered,
        rating: c.rating,
      })),
    });
  } catch (error) {
    console.error('[showsController] getTrendingShows error:', error);
    res.status(500).json({ error: 'Failed to fetch trending shows' });
  }
};

export const getSimilarShowsForShow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const tvmazeId = parseInt(id, 10);

    let title = '';
    let genres: string[] = [];

    if (!isNaN(tvmazeId)) {
      const show = await tvmazeService.getShowDetails(tvmazeId);
      title = show.name;
      genres = show.genres || [];
    } else {
      const dbShow = await prisma.show.findUnique({ where: { id } });
      if (dbShow) {
        title = dbShow.title;
        genres = dbShow.genres;
      }
    }

    if (!title) {
      res.status(404).json({ error: 'Show not found' });
      return;
    }

    const similarTitles = await tmdbService.getSimilarTitlesForShow(title, genres);
    const similarShows = [];

    for (const simTitle of similarTitles) {
      if (simTitle.toLowerCase().trim() === title.toLowerCase().trim()) continue;

      try {
        const searchRes = await tvmazeService.searchShows(simTitle);
        if (searchRes.length > 0) {
          const s = searchRes[0];
          const providers = await watchmodeService.getStreamingProviders(
            s.name,
            s.network?.name || s.webChannel?.name,
            'US'
          );

          similarShows.push({
            tvmazeId: s.id,
            title: s.name,
            summary: stripHtml(s.summary),
            posterUrl: s.image?.medium || s.image?.original || null,
            backdropUrl: s.image?.original || null,
            status: s.status,
            genres: s.genres || [],
            network: s.network?.name || s.webChannel?.name || null,
            premiered: s.premiered,
            rating: s.rating?.average || null,
            streamingProviders: providers,
          });

          if (similarShows.length >= 6) break;
        }
      } catch (err) {
        // Skip
      }
    }

    res.json({ results: similarShows });
  } catch (error) {
    console.error('[showsController] getSimilarShowsForShow error:', error);
    res.status(500).json({ error: 'Failed to fetch similar shows' });
  }
};
