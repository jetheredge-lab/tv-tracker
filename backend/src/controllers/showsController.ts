import { Request, Response } from 'express';
import tvmazeService, { stripHtml } from '../services/tvmaze.js';
import prisma from '../services/prisma.js';
import tmdbService from '../services/tmdb.js';
import watchmodeService from '../services/watchmode.js';

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

export const getTrendingShows = async (_req: Request, res: Response): Promise<void> => {
  try {
    const popularTitles = [
      'Severance',
      'The Bear',
      'House of the Dragon',
      'The Last of Us',
      'Fallout',
      'Stranger Things',
      'The Boys',
      'Shogun',
      'Ted Lasso',
    ];

    const results = [];
    for (const title of popularTitles) {
      try {
        const searchRes = await tvmazeService.searchShows(title);
        if (searchRes.length > 0) {
          const s = searchRes[0];
          results.push({
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
          });
        }
      } catch (err) {
        // Skip
      }
    }

    res.json({ results });
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
