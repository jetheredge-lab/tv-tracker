import { Request, Response } from 'express';
import icsCalendarService from '../services/ics.js';
import prisma from '../services/prisma.js';

export const getIcsFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).send('userId is required');
      return;
    }

    const icsContent = await icsCalendarService.generateUserIcsFeed(userId);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="tvtracker-${userId}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(200).send(icsContent);
  } catch (error) {
    console.error('[calendarController] getIcsFeed error:', error);
    res.status(500).send('Error generating calendar feed');
  }
};

export const getCalendarEpisodes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    // Get user's active watchlists
    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      select: { showId: true },
    });

    const showIds = watchlists.map(w => w.showId);
    if (showIds.length === 0) {
      res.json({ episodes: [] });
      return;
    }

    // Query episodes for these shows
    const whereClause: Record<string, any> = {
      showId: { in: showIds },
      airdate: { not: null },
    };

    if (year && month) {
      const monthPadded = String(month).padStart(2, '0');
      whereClause.airdate = {
        startsWith: `${year}-${monthPadded}`,
      };
    }

    const episodes = await prisma.episode.findMany({
      where: whereClause,
      include: {
        show: {
          include: {
            streamingProviders: true,
          },
        },
      },
      orderBy: [{ airdate: 'asc' }, { airtime: 'asc' }],
    });

    const formatted = episodes.map(ep => ({
      id: ep.id,
      season: ep.season,
      number: ep.number,
      title: ep.title,
      airdate: ep.airdate,
      airtime: ep.airtime,
      summary: ep.summary,
      runtime: ep.runtime,
      image: ep.image,
      show: {
        id: ep.show.id,
        tvmazeId: ep.show.tvmazeId,
        title: ep.show.title,
        posterUrl: ep.show.posterUrl,
        network: ep.show.network,
        streamingProviders: ep.show.streamingProviders,
      },
    }));

    res.json({ episodes: formatted });
  } catch (error) {
    console.error('[calendarController] getCalendarEpisodes error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar episodes', message: (error as Error).message });
  }
};
