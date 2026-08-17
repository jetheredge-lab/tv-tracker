import prisma from './prisma.js';
import tmdbService from './tmdb.js';
import tvmazeService, { stripHtml } from './tvmaze.js';
import watchmodeService from './watchmode.js';
import { RecommendationSection } from '../types/index.js';

export class RecommendationEngineService {
  /**
   * Generates rich personalized recommendation carousels for a user
   */
  async getPersonalizedRecommendations(userId: string): Promise<RecommendationSection[]> {
    // 1. Fetch user's watchlist with populated shows and streaming providers
    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      include: {
        show: {
          include: {
            streamingProviders: true,
          },
        },
      },
      orderBy: [
        { isFavorite: 'desc' },
        { rating: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    // 2. Fetch user's dismissed recommendations
    const dismissed = await prisma.dismissedRecommendation.findMany({
      where: { userId },
      include: {
        show: true,
      },
    });

    // Excluded TVmaze IDs and titles (already watchlisted or dismissed)
    const excludedTvmazeIds = new Set<number>();
    const excludedTitles = new Set<string>();

    for (const w of watchlists) {
      excludedTvmazeIds.add(w.show.tvmazeId);
      excludedTitles.add(w.show.title.toLowerCase().trim());
    }

    for (const d of dismissed) {
      excludedTvmazeIds.add(d.show.tvmazeId);
      excludedTitles.add(d.show.title.toLowerCase().trim());
    }

    const sections: RecommendationSection[] = [];
    const globallyRecommendedTvmazeIds = new Set<number>();

    // 3. Generate "Because You Watched..." Carousels based on Top Shows
    // Prioritize: Favorites -> 4-5 Star Rated Shows -> Currently Watching Shows
    const seedCandidates = watchlists.filter(
      w => w.isFavorite || (w.rating && w.rating >= 4) || w.status === 'WATCHING'
    );

    const seedShows = (seedCandidates.length > 0 ? seedCandidates : watchlists).slice(0, 3);

    for (const seed of seedShows) {
      const sourceShow = seed.show;
      const similarTitles = await tmdbService.getSimilarTitlesForShow(
        sourceShow.title,
        sourceShow.genres
      );

      const recommendedShows: RecommendationSection['shows'] = [];

      for (const title of similarTitles) {
        if (excludedTitles.has(title.toLowerCase().trim())) continue;

        try {
          const searchResults = await tvmazeService.searchShows(title);
          if (searchResults.length > 0) {
            const rawShow = searchResults[0];

            if (
              excludedTvmazeIds.has(rawShow.id) ||
              globallyRecommendedTvmazeIds.has(rawShow.id)
            ) {
              continue;
            }

            const providers = await watchmodeService.getStreamingProviders(
              rawShow.name,
              rawShow.network?.name || rawShow.webChannel?.name,
              'US'
            );

            recommendedShows.push({
              tvmazeId: rawShow.id,
              title: rawShow.name,
              summary: stripHtml(rawShow.summary),
              posterUrl: rawShow.image?.medium || rawShow.image?.original || null,
              backdropUrl: rawShow.image?.original || null,
              status: rawShow.status,
              genres: rawShow.genres || [],
              network: rawShow.network?.name || rawShow.webChannel?.name || null,
              premiered: rawShow.premiered,
              rating: rawShow.rating?.average || null,
              streamingProviders: providers,
            });

            globallyRecommendedTvmazeIds.add(rawShow.id);
            if (recommendedShows.length >= 6) break;
          }
        } catch (err) {
          // Skip individual lookup errors
        }
      }

      if (recommendedShows.length > 0) {
        sections.push({
          id: `rec_because_${sourceShow.id}`,
          title: `Because you watched ${sourceShow.title}`,
          subtitle: seed.isFavorite
            ? 'Based on your favorites'
            : seed.rating
            ? `Based on your ${seed.rating}-star rating`
            : 'Similar themes and genre',
          sourceShow: {
            id: sourceShow.id,
            tvmazeId: sourceShow.tvmazeId,
            title: sourceShow.title,
          },
          shows: recommendedShows,
        });
      }
    }

    // 4. Generate "Popular on Your Streaming Services"
    // Count user's most frequent streaming providers
    const providerCounts = new Map<string, number>();
    for (const w of watchlists) {
      for (const p of w.show.streamingProviders) {
        providerCounts.set(p.providerName, (providerCounts.get(p.providerName) || 0) + 1);
      }
    }

    let topProviderName = 'Popular Streaming';
    if (providerCounts.size > 0) {
      topProviderName = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Trending titles section
    const trendingTitles = await tmdbService.getTrendingTitles();
    const trendingShows: RecommendationSection['shows'] = [];

    for (const title of trendingTitles) {
      if (excludedTitles.has(title.toLowerCase().trim())) continue;

      try {
        const searchResults = await tvmazeService.searchShows(title);
        if (searchResults.length > 0) {
          const rawShow = searchResults[0];

          if (
            excludedTvmazeIds.has(rawShow.id) ||
            globallyRecommendedTvmazeIds.has(rawShow.id)
          ) {
            continue;
          }

          const providers = await watchmodeService.getStreamingProviders(
            rawShow.name,
            rawShow.network?.name || rawShow.webChannel?.name,
            'US'
          );

          trendingShows.push({
            tvmazeId: rawShow.id,
            title: rawShow.name,
            summary: stripHtml(rawShow.summary),
            posterUrl: rawShow.image?.medium || rawShow.image?.original || null,
            backdropUrl: rawShow.image?.original || null,
            status: rawShow.status,
            genres: rawShow.genres || [],
            network: rawShow.network?.name || rawShow.webChannel?.name || null,
            premiered: rawShow.premiered,
            rating: rawShow.rating?.average || null,
            streamingProviders: providers,
          });

          globallyRecommendedTvmazeIds.add(rawShow.id);
          if (trendingShows.length >= 8) break;
        }
      } catch (err) {
        // Skip
      }
    }

    if (trendingShows.length > 0) {
      sections.push({
        id: 'rec_trending_week',
        title: 'Trending This Week',
        subtitle: `Top picks & popular releases on ${topProviderName}`,
        shows: trendingShows,
      });
    }

    return sections;
  }

  /**
   * Dismiss a show from future recommendations for a user
   */
  async dismissRecommendation(userId: string, tvmazeId?: number, showId?: string) {
    let targetShowId = showId;

    if (!targetShowId && tvmazeId) {
      // Sync show with database first
      const show = await tvmazeService.syncShowWithDb(tvmazeId);
      if (show) {
        targetShowId = show.id;
      }
    }

    if (!targetShowId) {
      throw new Error('Either showId or tvmazeId must be provided');
    }

    // Ensure user exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    return prisma.dismissedRecommendation.upsert({
      where: {
        userId_showId: {
          userId,
          showId: targetShowId,
        },
      },
      update: {},
      create: {
        userId,
        showId: targetShowId,
      },
    });
  }
}

export const recommendationEngine = new RecommendationEngineService();
export default recommendationEngine;
