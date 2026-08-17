import { createEvents, EventAttributes } from 'ics';
import prisma from './prisma.js';

export class IcsCalendarService {
  /**
   * Generates dynamic ICS calendar feed content for a user's watchlist
   */
  async generateUserIcsFeed(userId: string): Promise<string> {
    // 1. Fetch user watchlists with shows, episodes, and streaming providers
    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      include: {
        show: {
          include: {
            episodes: {
              where: {
                airdate: { not: null },
              },
              orderBy: [{ airdate: 'asc' }, { number: 'asc' }],
            },
            streamingProviders: true,
          },
        },
      },
    });

    if (!watchlists || watchlists.length === 0) {
      return this.generateEmptyIcsCalendar();
    }

    const events: EventAttributes[] = [];

    for (const item of watchlists) {
      const show = item.show;
      const streamingList = show.streamingProviders
        .map(sp => sp.providerName + (sp.deepLink ? ` (${sp.deepLink})` : ''))
        .join(', ');
      const location = show.streamingProviders[0]?.providerName || show.network || 'TV';

      for (const ep of show.episodes) {
        if (!ep.airdate) continue;

        const dateParts = ep.airdate.split('-').map(Number);
        if (dateParts.length !== 3 || isNaN(dateParts[0]) || isNaN(dateParts[1]) || isNaN(dateParts[2])) {
          continue;
        }

        const [year, month, day] = dateParts;
        let start: [number, number, number, number, number];
        let duration = { minutes: ep.runtime || 60 };

        if (ep.airtime && ep.airtime.includes(':')) {
          const [hours, mins] = ep.airtime.split(':').map(Number);
          start = [year, month, day, isNaN(hours) ? 20 : hours, isNaN(mins) ? 0 : mins];
        } else {
          // Default evening airtime (8:00 PM) if time unspecified
          start = [year, month, day, 20, 0];
        }

        const seasonCode = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
        const title = `${show.title} ${seasonCode} - ${ep.title}`;
        
        let description = `Show: ${show.title}\nEpisode: ${seasonCode} "${ep.title}"\nNetwork: ${show.network || 'Unknown'}\n`;
        if (streamingList) {
          description += `Where to Watch: ${streamingList}\n`;
        }
        if (ep.summary) {
          description += `\nSynopsis:\n${ep.summary}\n`;
        }
        description += `\nTracked via TV Tracker`;

        events.push({
          uid: `tvtracker-${ep.id}@tvtracker.app`,
          title,
          start,
          duration,
          description,
          location,
          url: show.streamingProviders[0]?.deepLink || undefined,
          status: 'CONFIRMED',
          busyStatus: 'FREE',
          categories: ['TV Shows', 'TV Tracker'],
          alarms: [
            {
              action: 'display',
              description: `New Episode: ${title} airs today!`,
              trigger: { hours: 1, before: true },
            },
          ],
        });
      }
    }

    if (events.length === 0) {
      return this.generateEmptyIcsCalendar();
    }

    return new Promise((resolve, reject) => {
      createEvents(events, (error, value) => {
        if (error) {
          console.error('[IcsCalendarService] Error generating ICS feed:', error);
          reject(error);
          return;
        }

        // Add custom calendar metadata header
        const customCalHeader = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//TV Tracker//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'X-WR-CALNAME:TV Tracker Schedule',
          'X-WR-TIMEZONE:UTC',
          'X-WR-CALDESC:Your personalized TV show release calendar feed',
        ].join('\r\n');

        const icsWithMetadata = value.replace('BEGIN:VCALENDAR\r\nVERSION:2.0', customCalHeader);
        resolve(icsWithMetadata);
      });
    });
  }

  private generateEmptyIcsCalendar(): string {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TV Tracker//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:TV Tracker Schedule',
      'X-WR-CALDESC:Your personalized TV show release calendar feed',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}

export const icsCalendarService = new IcsCalendarService();
export default icsCalendarService;
