import { Response } from 'express';
import prisma from '../services/prisma.js';
import tvmazeService from '../services/tvmaze.js';
import movieService from '../services/movies.js';
import { WatchlistStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { invalidateUserRecommendations } from '../services/recommendation.js';

export const getUserWatchlist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      include: {
        show: {
          include: {
            episodes: {
              orderBy: [{ airdate: 'asc' }, { season: 'asc' }, { number: 'asc' }],
            },
            streamingProviders: true,
          },
        },
      },
      orderBy: [
        { isFavorite: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const formatted = watchlists.map(item => {
      const show = item.show;
      const allEpisodes = show.episodes || [];

      // Find next episode airing on or after today
      const upcomingEpisodes = allEpisodes.filter(
        ep => ep.airdate && ep.airdate >= todayStr
      );
      const nextEpisode = upcomingEpisodes.length > 0 ? upcomingEpisodes[0] : null;

      // Find latest aired episode before today
      const pastEpisodes = allEpisodes.filter(
        ep => ep.airdate && ep.airdate < todayStr
      );
      const latestAiredEpisode =
        pastEpisodes.length > 0 ? pastEpisodes[pastEpisodes.length - 1] : null;

      return {
        id: item.id,
        userId: item.userId,
        showId: item.showId,
        status: item.status,
        rating: item.rating,
        isFavorite: item.isFavorite,
        preferredRegion: item.preferredRegion,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        show: {
          id: show.id,
          mediaType: show.mediaType,
          tvmazeId: show.tvmazeId,
          tmdbId: show.tmdbId,
          releaseDate: show.releaseDate,
          runtime: show.runtime,
          title: show.title,
          summary: show.summary,
          posterUrl: show.posterUrl,
          backdropUrl: show.backdropUrl,
          status: show.status,
          genres: show.genres,
          network: show.network,
          premiered: show.premiered,
          rating: show.rating,
          streamingProviders: show.streamingProviders,
          totalEpisodes: allEpisodes.length,
          nextEpisode: nextEpisode
            ? {
                id: nextEpisode.id,
                season: nextEpisode.season,
                number: nextEpisode.number,
                title: nextEpisode.title,
                airdate: nextEpisode.airdate,
                airtime: nextEpisode.airtime,
                summary: nextEpisode.summary,
              }
            : null,
          latestAiredEpisode: latestAiredEpisode
            ? {
                id: latestAiredEpisode.id,
                season: latestAiredEpisode.season,
                number: latestAiredEpisode.number,
                title: latestAiredEpisode.title,
                airdate: latestAiredEpisode.airdate,
              }
            : null,
        },
      };
    });

    res.json({ watchlist: formatted });
  } catch (error) {
    console.error('[watchlistController] getUserWatchlist error:', error);
    res.status(500).json({ error: 'Failed to fetch user watchlist', message: (error as Error).message });
  }
};

export const addToWatchlist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId || req.body.userId;
    const {
      tvmazeId,
      tmdbId,
      status = 'WATCHING',
      rating = null,
      isFavorite = false,
      preferredRegion = 'US',
    } = req.body;

    // One watchlist holds both media. A tvmazeId means a series, a tmdbId means
    // a film; exactly one is required.
    if (!userId || (!tvmazeId && !tmdbId)) {
      res.status(400).json({ error: 'userId and either tvmazeId or tmdbId are required' });
      return;
    }

    // 1. Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        preferredRegion,
      },
    });

    // 2. Resolve the title into a Show row, from whichever source owns it.
    const show = tvmazeId
      ? await tvmazeService.syncShowWithDb(Number(tvmazeId), preferredRegion)
      : await movieService.syncMovieWithDb(Number(tmdbId), preferredRegion);

    if (!show) {
      res.status(404).json({
        error: tvmazeId ? 'Show not found on TVmaze' : 'Movie not found on TMDB',
      });
      return;
    }

    // 3. Upsert Watchlist entry
    const validStatus = (status.toUpperCase() as WatchlistStatus) || WatchlistStatus.WATCHING;
    const watchlistItem = await prisma.watchlist.upsert({
      where: {
        userId_showId: {
          userId,
          showId: show.id,
        },
      },
      update: {
        status: validStatus,
        rating: rating !== undefined ? (rating ? Number(rating) : null) : undefined,
        isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : undefined,
        preferredRegion,
      },
      create: {
        userId,
        showId: show.id,
        status: validStatus,
        rating: rating ? Number(rating) : null,
        isFavorite: Boolean(isFavorite),
        preferredRegion,
      },
      include: {
        show: {
          include: {
            streamingProviders: true,
            episodes: true,
          },
        },
      },
    });

    // The new show changes this user's taste profile - drop their cached rows.
    invalidateUserRecommendations(userId);

    res.status(201).json({ item: watchlistItem });
  } catch (error) {
    console.error('[watchlistController] addToWatchlist error:', error);
    res.status(500).json({ error: 'Failed to add show to watchlist', message: (error as Error).message });
  }
};

export const updateWatchlist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { status, rating, isFavorite, preferredRegion } = req.body;

    // Check ownership if user is authenticated
    if (userId) {
      const existing = await prisma.watchlist.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        res.status(403).json({ error: 'Forbidden. You cannot update another user\'s watchlist.' });
        return;
      }
    }

    const dataToUpdate: Record<string, any> = {};
    if (status) {
      dataToUpdate.status = status.toUpperCase() as WatchlistStatus;
    }
    if (rating !== undefined) {
      dataToUpdate.rating = rating ? Number(rating) : null;
    }
    if (isFavorite !== undefined) {
      dataToUpdate.isFavorite = Boolean(isFavorite);
    }
    if (preferredRegion) {
      dataToUpdate.preferredRegion = preferredRegion;
    }

    const updated = await prisma.watchlist.update({
      where: { id },
      data: dataToUpdate,
      include: {
        show: {
          include: {
            streamingProviders: true,
          },
        },
      },
    });

    if (userId) invalidateUserRecommendations(userId);

    res.json({ item: updated });
  } catch (error) {
    console.error('[watchlistController] updateWatchlist error:', error);
    res.status(500).json({ error: 'Failed to update watchlist item', message: (error as Error).message });
  }
};

export const removeFromWatchlist = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (userId) {
      const existing = await prisma.watchlist.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        res.status(403).json({ error: 'Forbidden. You cannot delete another user\'s watchlist item.' });
        return;
      }
    }

    await prisma.watchlist.delete({
      where: { id },
    });

    if (userId) invalidateUserRecommendations(userId);

    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (error) {
    console.error('[watchlistController] removeFromWatchlist error:', error);
    res.status(500).json({ error: 'Failed to remove from watchlist', message: (error as Error).message });
  }
};
