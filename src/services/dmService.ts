/**
 * Direct Message Service for sending notifications to users
 */

import { Client, EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';
import EmbedBuilder from '../utils/embedBuilder';

interface DMNotification {
  userId: string;
  title: string;
  message: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

class DMService {
  private client: Client | null = null;

  constructor(client?: Client) {
    this.client = client || null;
  }

  /**
   * Set the Discord client for sending DMs
   */
  setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Send a DM notification to a user
   */
  async sendDM(notification: DMNotification): Promise<boolean> {
    try {
      if (!this.client) {
        console.error('Discord client not set for DM service');
        return false;
      }

      const user = await this.client.users.fetch(notification.userId);
      if (!user) {
        console.error(`User ${notification.userId} not found`);
        return false;
      }

      const embed = new DiscordEmbedBuilder()
        .setTitle(notification.title)
        .setDescription(notification.message)
        .setColor(notification.color || 0x8B5DFF)
        .setTimestamp()
        .setFooter({
          text: 'Audius Discord Bot',
          iconURL: this.client.user?.displayAvatarURL()
        });

      if (notification.fields) {
        embed.addFields(notification.fields);
      }

      await user.send({ embeds: [embed] });
      
      console.log(`📬 DM sent to ${user.tag}: ${notification.title}`);
      return true;

    } catch (error) {
      console.error(`Failed to send DM to ${notification.userId}:`, error);
      return false;
    }
  }

  /**
   * Send Spotify connection success DM
   */
  async notifySpotifyConnected(userId: string, spotifyProfile: any): Promise<void> {
    await this.sendDM({
      userId,
      title: '🎵 Spotify Connected!',
      message: `🎉 **Your Spotify account has been successfully connected!**\n\n` +
               `**Connected Account:**\n` +
               `${spotifyProfile.display_name}\n` +
               `${spotifyProfile.email}\n` +
               `${spotifyProfile.product === 'premium' ? '👑 Premium Account' : '🆓 Free Account'}\n\n` +
               `**What's next:**\n` +
               `• Use \`/account\` to view your connected accounts\n` +
               `• Join music raids and earn rewards\n` +
               `• Your listening activity will now be tracked\n\n` +
               `*Thank you for connecting your Spotify account!*`,
      color: 0x1DB954,
      fields: [
        {
          name: '🎯 Available Features',
          value: '• Track listening for raids\n• Earn token rewards\n• Access premium features',
          inline: false
        }
      ]
    });
  }

  /**
   * Send Audius connection success DM
   */
  async notifyAudiusConnected(userId: string, audiusProfile: any): Promise<void> {
    await this.sendDM({
      userId,
      title: '🎵 Audius Connected!',
      message: `🎉 **Your Audius account has been successfully connected!**\n\n` +
               `**Connected Account:**\n` +
               `${audiusProfile.name} (@${audiusProfile.handle})\n` +
               `${audiusProfile.verified ? '✅ Verified Artist' : '🎧 Music Fan'}\n\n` +
               `**What's next:**\n` +
               `• Use \`/account\` to view your connected accounts\n` +
               `• Use \`/listen\` to track listening and earn rewards\n` +
               `• Join music raids for your favorite tracks\n\n` +
               `*Thank you for connecting your Audius account!*`,
      color: 0xCC0FE0,
      fields: [
        {
          name: '🎵 New Commands Available',
          value: '• `/listen track_id:D7KyD` - Track listening\n• `/listen artist_handle:skrillex` - Check what artists are playing',
          inline: false
        }
      ]
    });
  }

  /**
   * Send listening reward notification
   */
  async notifyListeningReward(userId: string, trackTitle: string, pointsEarned: number): Promise<void> {
    await this.sendDM({
      userId,
      title: '🎵 Listening Reward Earned!',
      message: `🎉 **You earned ${pointsEarned} tokens for listening!**\n\n` +
               `**Track:** ${trackTitle}\n` +
               `**Reward:** ${pointsEarned} tokens\n\n` +
               `Keep listening to earn more rewards!\n` +
               `Use \`/wallet\` to check your total balance.`,
      color: 0xFFD700
    });
  }

  /**
   * Send general notification
   */
  async sendNotification(userId: string, title: string, message: string, color?: number): Promise<void> {
    await this.sendDM({
      userId,
      title,
      message,
      color
    });
  }
}

export default DMService;
export { DMNotification };
