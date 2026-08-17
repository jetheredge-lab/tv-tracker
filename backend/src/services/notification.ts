import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

export class NotificationService {
  private expo = new Expo();

  /**
   * Dispatch push notifications in chunks to users
   */
  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    // Filter only valid expo push tokens
    const validMessages = messages.filter(msg => {
      const isValid = Expo.isExpoPushToken(msg.to);
      if (!isValid) {
        console.warn(`[NotificationService] Invalid push token: ${msg.to}`);
      }
      return isValid;
    });

    if (validMessages.length === 0) {
      return [];
    }

    const chunks = this.expo.chunkPushNotifications(validMessages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('[NotificationService] Error sending push chunk:', error);
      }
    }

    return tickets;
  }

  /**
   * Send a formatted single episode drop notification
   */
  async sendEpisodeDropNotification(
    pushToken: string,
    showTitle: string,
    season: number,
    episodeNumber: number,
    episodeTitle: string,
    providerName?: string,
    showId?: string
  ) {
    if (!Expo.isExpoPushToken(pushToken)) {
      return null;
    }

    const seasonCode = `S${String(season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    const whereToWatch = providerName ? ` on ${providerName}` : '';
    const body = `New Episode: ${showTitle} ${seasonCode} drops today${whereToWatch}!`;

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title: `📺 New Episode: ${showTitle}`,
      body,
      data: {
        showId,
        season,
        episodeNumber,
        type: 'EPISODE_DROP',
      },
      priority: 'high',
      channelId: 'episode-drops',
    };

    return this.sendPushNotifications([message]);
  }
}

export const notificationService = new NotificationService();
export default notificationService;
