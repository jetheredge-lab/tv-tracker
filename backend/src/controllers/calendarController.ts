import { Request, Response } from 'express';
import icsCalendarService from '../services/ics.js';
import prisma from '../services/prisma.js';

/**
 * Serves the .ics subscription feed.
 *
 * Calendar clients (Google, Apple) fetch this URL on a schedule and cannot
 * send an Authorization header, so the URL itself has to be the credential.
 * It is keyed on an opaque per-user icsToken rather than the userId, so
 * pasting the feed into a third-party calendar never discloses the account id
 * that authenticates the rest of the API.
 */
export const getIcsFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const { icsToken } = req.params;
    if (!icsToken) {
      res.status(400).send('Feed token is required');
      return;
    }

    const user = await prisma.user.findUnique({ where: { icsToken } });
    if (!user) {
      res.status(404).send('Feed not found');
      return;
    }

    const icsContent = await icsCalendarService.generateUserIcsFeed(user.id);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="tvtracker.ics"');
    res.send(icsContent);
  } catch (error) {
    console.error('[calendarController] getIcsFeed error:', error);
    res.status(500).send('Failed to generate calendar feed');
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

    const monthPrefix = year && month ? `${year}-${String(month).padStart(2, '0')}` : null;
    if (monthPrefix) {
      whereClause.airdate = { startsWith: monthPrefix };
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

    // Films have no episodes; what lands in a calendar is a release date, and
    // there are two that matter - the cinema date and the streaming date, which
    // are often months apart. Both are emitted so the viewer can see whichever
    // they are waiting for.
    const movies = await prisma.show.findMany({
      where: { id: { in: showIds }, mediaType: 'MOVIE' },
      include: { streamingProviders: true },
    });

    const releases = [];
    for (const m of movies) {
      const candidates: Array<{ date: Date | null; kind: 'theatrical' | 'digital'; label: string }> = [
        { date: m.releaseDate, kind: 'theatrical', label: 'In cinemas' },
        { date: m.digitalReleaseDate, kind: 'digital', label: 'Streaming release' },
      ];

      const seen = new Set<string>();
      for (const c of candidates) {
        if (!c.date) continue;
        const airdate = c.date.toISOString().slice(0, 10);
        // A same-day cinema and streaming release is one event, not two.
        if (seen.has(airdate)) continue;
        seen.add(airdate);
        if (monthPrefix && !airdate.startsWith(monthPrefix)) continue;

        releases.push({
          id: `release-${m.id}-${c.kind}`,
          kind: 'movie_release' as const,
          releaseKind: c.kind,
          season: 0,
          number: 0,
          title: c.label,
          airdate,
          airtime: null,
          summary: m.summary,
          runtime: m.runtime,
          image: m.posterUrl,
          show: {
            id: m.id,
            mediaType: m.mediaType,
            tvmazeId: m.tvmazeId,
            tmdbId: m.tmdbId,
            title: m.title,
            posterUrl: m.posterUrl,
            network: null,
            streamingProviders: m.streamingProviders,
          },
        });
      }
    }

    const combined = [
      ...formatted.map(f => ({ ...f, kind: 'episode' as const, releaseKind: null })),
      ...releases,
    ].sort((a, b) => (a.airdate || '').localeCompare(b.airdate || ''));

    res.json({ episodes: combined });
  } catch (error) {
    console.error('[calendarController] getCalendarEpisodes error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar episodes', message: (error as Error).message });
  }
};
