import { recommendationEngine } from '../src/services/recommendation.js';
import prisma from '../src/services/prisma.js';

describe('Recommendation Engine Service', () => {
  it('should generate personalized carousels and filter out watchlisted and dismissed shows', async () => {
    // Mock user watchlist containing Severance marked as Favorite
    const mockWatchlists = [
      {
        id: 'wl_1',
        userId: 'test_user_rec',
        showId: 'show_sev',
        status: 'WATCHING',
        rating: 5,
        isFavorite: true,
        preferredRegion: 'US',
        show: {
          id: 'show_sev',
          tvmazeId: 44933,
          title: 'Severance',
          genres: ['Drama', 'Mystery', 'Sci-Fi'],
          network: 'Apple TV+',
          streamingProviders: [{ providerName: 'Apple TV+' }],
        },
      },
    ];

    // Mock dismissed shows containing "Dark" (tvmazeId 17861)
    const mockDismissed = [
      {
        id: 'd_1',
        userId: 'test_user_rec',
        showId: 'show_dark',
        show: {
          id: 'show_dark',
          tvmazeId: 17861,
          title: 'Dark',
        },
      },
    ];

    jest.spyOn(prisma.watchlist, 'findMany').mockResolvedValueOnce(mockWatchlists as any);
    jest.spyOn(prisma.dismissedRecommendation, 'findMany').mockResolvedValueOnce(mockDismissed as any);

    const sections = await recommendationEngine.getPersonalizedRecommendations('test_user_rec');

    expect(sections).toBeDefined();
    expect(sections.length).toBeGreaterThan(0);

    // Verify "Because you watched Severance" section exists
    const becauseSection = sections.find(s => s.title.includes('Severance'));
    expect(becauseSection).toBeDefined();
    expect(becauseSection?.subtitle).toBe('Based on your favorites');

    // Ensure Severance itself is not recommended
    const recommendedTitles = becauseSection?.shows.map(s => s.title.toLowerCase()) || [];
    expect(recommendedTitles).not.toContain('severance');

    // Ensure dismissed show "Dark" is excluded
    expect(recommendedTitles).not.toContain('dark');
  });
});
