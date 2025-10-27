import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { apiGet, ApiError, SessionContext } from '../lib/apiClient';

interface ActiveRaid {
  id: number;
  track_id: string;
  track_title?: string | null;
  track_artist?: string | null;
  track_artwork_url?: string | null;
  premium_only: boolean;
  required_listen_time: number;
  streams_goal: number;
  current_streams: number;
  reward_amount: number;
  token_mint: string;
  status: string;
  expires_at: string;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-list')
    .setDescription('View all active raids you can join'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const sessionContext: SessionContext = {
        discordId: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.globalName ?? interaction.user.displayName ?? undefined,
        avatarUrl: interaction.user.displayAvatarURL()
      };

      const raids = await apiGet<ActiveRaid[]>(sessionContext, '/api/raids/active');

      if (!raids.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('🎵 No Active Raids')
          .setDescription('There are no active raids right now. Check back soon!');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embeds = raids.slice(0, 5).map(raid => {
        const reward = typeof raid.reward_amount === 'number'
          ? raid.reward_amount
          : Number(raid.reward_amount);
        const rewardDisplay = Number.isFinite(reward)
          ? `${reward.toLocaleString()} ${raid.token_mint}`
          : `${raid.reward_amount} ${raid.token_mint}`;
        const timeRemaining = calculateTimeRemaining(raid.expires_at);
        const progress = raid.streams_goal
          ? Math.min(100, Math.round((raid.current_streams / raid.streams_goal) * 100))
          : 0;

        return new EmbedBuilder()
          .setColor('#4F46E5')
          .setTitle(raid.track_title || `Raid #${raid.id}`)
          .setAuthor({
            name: raid.track_artist ? `by ${raid.track_artist}` : 'Spotify Raid'
          })
          .addFields(
            {
              name: '🎵 Track ID',
              value: raid.track_id,
              inline: true,
            },
            {
              name: '💰 Reward',
              value: rewardDisplay,
              inline: true,
            },
            {
              name: '⏱️ Required Listen',
              value: `${raid.required_listen_time} seconds`,
              inline: true,
            },
            {
              name: '🎯 Progress',
              value: raid.streams_goal ? `${progress}% (${raid.current_streams}/${raid.streams_goal})` : 'N/A',
              inline: false,
            },
            {
              name: '⏰ Time Remaining',
              value: timeRemaining,
              inline: false,
            },
            {
              name: '🆔 Raid ID',
              value: `\`${raid.id}\``,
              inline: false,
            }
          )
          .setFooter({ text: raid.premium_only ? 'Premium Spotify users only' : 'Use /raid-join raid-id:<id> to participate' });
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('Error fetching raids:', error);
      const description =
        error instanceof ApiError
          ? `API responded with status ${error.status}: ${error.message}`
          : 'Failed to fetch active raids. Please try again later.';
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription(description);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

function calculateTimeRemaining(expiresAt?: string): string {
  if (!expiresAt) return 'Unknown';

  const now = new Date();
  const expiry = new Date(expiresAt);
  const ms = expiry.getTime() - now.getTime();

  if (ms <= 0) return '⏰ Expired';

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default command;
