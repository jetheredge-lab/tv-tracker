import { icsCalendarService } from '../src/services/ics.js';
import prisma from '../src/services/prisma.js';

describe('ICS Calendar Service', () => {
  it('should return empty valid VCALENDAR when user has no watchlists', async () => {
    // Mock prisma findMany returning empty array
    jest.spyOn(prisma.watchlist, 'findMany').mockResolvedValueOnce([] as any);

    const icsString = await icsCalendarService.generateUserIcsFeed('non-existent-user');
    expect(icsString).toContain('BEGIN:VCALENDAR');
    expect(icsString).toContain('VERSION:2.0');
    expect(icsString).toContain('END:VCALENDAR');
  });

  it('should format show episodes into RFC-5545 VEVENTs with metadata', async () => {
    const mockWatchlist = [
      {
        id: 'wl_1',
        userId: 'test_user_1',
        showId: 'show_1',
        status: 'WATCHING',
        preferredRegion: 'US',
        show: {
          id: 'show_1',
          tvmazeId: 39234,
          title: 'Severance',
          network: 'Apple TV+',
          streamingProviders: [
            { providerName: 'Apple TV+', deepLink: 'https://tv.apple.com/us/show/severance' },
          ],
          episodes: [
            {
              id: 'ep_1',
              season: 2,
              number: 1,
              title: 'Hello Ms. Cobel',
              airdate: '2026-10-24',
              airtime: '21:00',
              summary: 'Mark returns to the severed floor.',
              runtime: 55,
            },
          ],
        },
      },
    ];

    jest.spyOn(prisma.watchlist, 'findMany').mockResolvedValueOnce(mockWatchlist as any);

    const icsString = await icsCalendarService.generateUserIcsFeed('test_user_1');
    expect(icsString).toContain('BEGIN:VCALENDAR');
    expect(icsString).toContain('SUMMARY:Severance S02E01 - Hello Ms. Cobel');
    expect(icsString).toContain('Apple TV+');
    expect(icsString).toContain('BEGIN:VALARM');
    expect(icsString).toContain('END:VCALENDAR');
  });
});
