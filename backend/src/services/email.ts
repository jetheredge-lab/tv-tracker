import axios from 'axios';

export interface EmailEpisodeItem {
  showTitle: string;
  season: number;
  number: number;
  episodeTitle: string;
  providerName?: string;
}

export class EmailService {
  private resendApiKey = process.env.RESEND_API_KEY || null;
  private fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'alerts@tvtracker.app';

  /**
   * Send daily email digest of upcoming episode drops
   */
  async sendDailyEpisodeDigest(toEmail: string, episodes: EmailEpisodeItem[]): Promise<boolean> {
    if (!toEmail || episodes.length === 0) return false;

    const subject = `📺 Today's TV Releases: ${episodes.length} new episode${episodes.length > 1 ? 's' : ''} dropping!`;
    const html = this.buildDigestHtml(episodes);

    if (this.resendApiKey) {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: `CueList <${this.fromEmail}>`,
            to: [toEmail],
            subject,
            html,
          },
          {
            headers: {
              Authorization: `Bearer ${this.resendApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          }
        );
        console.log(`[EmailService] Sent digest email to ${toEmail}`);
        return true;
      } catch (error) {
        console.error(`[EmailService] Failed to send email to ${toEmail}:`, error);
        return false;
      }
    } else {
      console.log(`[EmailService - Dev Mode] Simulated email digest to ${toEmail}:`);
      console.log(`Subject: ${subject}`);
      episodes.forEach(ep => {
        const code = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
        console.log(`  - ${ep.showTitle} ${code}: ${ep.episodeTitle} (on ${ep.providerName || 'TV'})`);
      });
      return true;
    }
  }

  private buildDigestHtml(episodes: EmailEpisodeItem[]): string {
    const listHtml = episodes
      .map(ep => {
        const seasonCode = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
        return `
        <tr style="border-bottom: 1px solid #27272a;">
          <td style="padding: 12px 0;">
            <div style="font-weight: 600; font-size: 16px; color: #ffffff;">${ep.showTitle}</div>
            <div style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">
              ${seasonCode} &bull; "${ep.episodeTitle}"
            </div>
            ${
              ep.providerName
                ? `<span style="display: inline-block; margin-top: 6px; padding: 2px 8px; font-size: 12px; background-color: #6366f1; color: #ffffff; border-radius: 4px;">${ep.providerName}</span>`
                : ''
            }
          </td>
        </tr>
      `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 24px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #18181b; border-radius: 12px; padding: 32px; border: 1px solid #27272a; }
          .header { text-align: center; border-bottom: 1px solid #27272a; padding-bottom: 20px; }
          .logo { font-size: 24px; font-weight: 700; color: #818cf8; }
          .subtitle { color: #a1a1aa; font-size: 14px; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎬 CueList</div>
            <div class="subtitle">Your Daily Show Release Digest</div>
          </div>
          <p style="margin-top: 24px; font-size: 15px; color: #e4e4e7;">
            Here are the new episodes from your watchlist airing today:
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
            ${listHtml}
          </table>
          <div style="margin-top: 32px; text-align: center; color: #71717a; font-size: 12px;">
            You received this because you enabled CueList email alerts.
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export const emailService = new EmailService();
export default emailService;
