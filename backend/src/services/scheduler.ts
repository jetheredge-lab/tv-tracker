import cron from 'node-cron';
import prisma from './prisma.js';
import tvmazeService from './tvmaze.js';
import watchmodeService from './watchmode.js';
import notificationService from './notification.js';
import emailService, { EmailEpisodeItem } from './email.js';

export class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Initialize and start the daily scheduler (Runs at 00:05 UTC daily)
   */
  start() {
    console.log('[SchedulerService] Starting background cron job (Daily at 00:05 UTC)...');
    
    // '5 0 * * *' = At 00:05 UTC every day
    this.cronJob = cron.schedule('5 0 * * *', async () => {
      console.log('[SchedulerService] Running nightly episode check and notification dispatch...');
      try {
        await this.runDailyEpisodeSync();
      } catch (error) {
        console.error('[SchedulerService] Error during scheduled sync:', error);
      }
    }, {
      timezone: 'UTC',
    });
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[SchedulerService] Cron job stopped.');
    }
  }

  /**
   * Core logic for daily sync and notification dispatch
   */
  async runDailyEpisodeSync(targetDate?: string) {
    const todayStr = targetDate || new Date().toISOString().split('T')[0];
    console.log(`[SchedulerService] Executing daily sync for date: ${todayStr}`);

    // 1. Gather all active watchlists (WATCHING or PLAN_TO_WATCH)
    const activeWatchlists = await prisma.watchlist.findMany({
      where: {
        status: { in: ['WATCHING', 'PLAN_TO_WATCH'] },
      },
      include: {
        user: true,
        show: {
          include: {
            episodes: {
              where: { airdate: todayStr },
            },
            streamingProviders: true,
          },
        },
      },
    });

    if (activeWatchlists.length === 0) {
      console.log('[SchedulerService] No active watchlists found.');
      return { processedShows: 0, notificationsSent: 0, emailsSent: 0 };
    }

    // 2. Distinct shows to refresh from TVmaze
    const distinctShowsMap = new Map<string, (typeof activeWatchlists)[number]['show']>();
    for (const item of activeWatchlists) {
      if (!distinctShowsMap.has(item.showId)) {
        distinctShowsMap.set(item.showId, item.show);
      }
    }

    console.log(`[SchedulerService] Refreshing ${distinctShowsMap.size} distinct active shows from TVmaze...`);
    for (const [showId, show] of distinctShowsMap.entries()) {
      try {
        await tvmazeService.syncShowWithDb(show.tvmazeId, 'US');
      } catch (err) {
        console.warn(`[SchedulerService] Failed to sync TVmaze data for show "${show.title}":`, err);
      }
    }

    // 3. Find episodes airing today across active shows
    const showsWithTodayEpisodes = await prisma.show.findMany({
      where: {
        id: { in: Array.from(distinctShowsMap.keys()) },
        episodes: {
          some: { airdate: todayStr },
        },
      },
      include: {
        episodes: {
          where: { airdate: todayStr },
        },
        streamingProviders: true,
        watchlists: {
          where: {
            status: { in: ['WATCHING', 'PLAN_TO_WATCH'] },
          },
          include: {
            user: true,
          },
        },
      },
    });

    let notificationsSent = 0;
    let emailsSent = 0;

    // Group airing episodes by user
    const userEpisodesMap = new Map<
      string,
      {
        user: typeof activeWatchlists[0]['user'];
        episodes: Array<{
          showTitle: string;
          showId: string;
          season: number;
          number: number;
          episodeTitle: string;
          providerName?: string;
        }>;
      }
    >();

    for (const show of showsWithTodayEpisodes) {
      const provider = show.streamingProviders[0]?.providerName || show.network || undefined;

      for (const ep of show.episodes) {
        for (const wl of show.watchlists) {
          const user = wl.user;
          if (!userEpisodesMap.has(user.id)) {
            userEpisodesMap.set(user.id, { user, episodes: [] });
          }

          userEpisodesMap.get(user.id)!.episodes.push({
            showTitle: show.title,
            showId: show.id,
            season: ep.season,
            number: ep.number,
            episodeTitle: ep.title,
            providerName: provider,
          });
        }
      }
    }

    // 4. Dispatch Push and Email notifications to users
    for (const [userId, { user, episodes }] of userEpisodesMap.entries()) {
      // Send Push Notifications
      if (user.pushToken && user.pushAlertsEnabled) {
        for (const ep of episodes) {
          try {
            await notificationService.sendEpisodeDropNotification(
              user.pushToken,
              ep.showTitle,
              ep.season,
              ep.number,
              ep.episodeTitle,
              ep.providerName,
              ep.showId
            );
            notificationsSent++;
          } catch (err) {
            console.error(`[SchedulerService] Push error for user ${userId}:`, err);
          }
        }
      }

      // Send Email Digest
      if (user.email && user.emailAlertsEnabled && episodes.length > 0) {
        try {
          const emailItems: EmailEpisodeItem[] = episodes.map(e => ({
            showTitle: e.showTitle,
            season: e.season,
            number: e.number,
            episodeTitle: e.episodeTitle,
            providerName: e.providerName,
          }));
          await emailService.sendDailyEpisodeDigest(user.email, emailItems);
          emailsSent++;
        } catch (err) {
          console.error(`[SchedulerService] Email error for user ${userId}:`, err);
        }
      }
    }

    console.log(
      `[SchedulerService] Completed daily sync. Shows: ${showsWithTodayEpisodes.length}, Push: ${notificationsSent}, Emails: ${emailsSent}`
    );

    return {
      processedShows: showsWithTodayEpisodes.length,
      notificationsSent,
      emailsSent,
    };
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;
