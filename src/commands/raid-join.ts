import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { apiGet, apiPost, ApiError, SessionContext } from '../lib/apiClient';

interface RaidDetails {
  id: number;
  track_title?: string | null;
  track_artist?: string | null;
  required_listen_time: number;
  reward_amount: number;
  token_mint: string;
  streams_goal: number;
  current_streams: number;
  status: string;
}

interface RaidJoinResponse {
  ok: boolean;
  participant_id: number;
  tracking_method: string;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-join')
    .setDescription('Join an active raid')
    .addStringOption(option =>
      option
        .setName('raid-id')
        .setDescription('The raid ID to join')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const raidId = interaction.options.getString('raid-id', true);
      const sessionContext: SessionContext = {
        discordId: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.globalName ?? interaction.user.displayName ?? undefined,
        avatarUrl: interaction.user.displayAvatarURL()
      };

      let joinResult: RaidJoinResponse;

      try {
        joinResult = await apiPost<RaidJoinResponse>(
          sessionContext,
          `/api/raids/${encodeURIComponent(raidId)}/join`,
          {}
        );
      } catch (error) {
        if (error instanceof ApiError) {
          let description = error.message;
          if (error.status === 404) {
            description = 'This raid does not exist or has expired.';
          } else if (error.status === 400) {
            const details = (error.details as Record<string, unknown> | undefined)?.error;
            description = typeof details === 'string' ? details : error.message;
          }

          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ Unable to Join Raid')
            .setDescription(description);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        throw error;
      }

      const raid = await apiGet<RaidDetails>(
        sessionContext,
        `/api/raids/${encodeURIComponent(raidId)}`
      );

      const rewardValue = Number(raid.reward_amount);
      const rewardDisplay = Number.isFinite(rewardValue)
        ? `${rewardValue.toLocaleString()} ${raid.token_mint}`
        : `${raid.reward_amount} ${raid.token_mint}`;

      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('✅ Joined Raid')
        .setDescription(
          `You're now participating in raid #${raid.id}. Tracking method: **${joinResult.tracking_method.replace(/_/g, ' ')}**.`
        )
        .addFields(
          {
            name: '🎵 Track',
            value: `${raid.track_title || 'Unknown Title'} by ${raid.track_artist || 'Unknown Artist'}`,
            inline: false,
          },
          {
            name: '📋 Objective',
            value:
              `• Listen for **${raid.required_listen_time} seconds**\n` +
              `• Goal: ${raid.streams_goal ? `${raid.streams_goal.toLocaleString()} streams` : 'N/A'}\n` +
              '• Stay active until the raid ends to qualify',
            inline: false,
          },
          {
            name: '💰 Reward',
            value: rewardDisplay,
            inline: true,
          },
          {
            name: '🎯 Progress',
            value: raid.streams_goal
              ? `${raid.current_streams.toLocaleString()} / ${raid.streams_goal.toLocaleString()} streams`
              : 'N/A',
            inline: true,
          }
        )
        .setFooter({ text: 'Your listening time is tracked automatically. Use /raid-claim once qualified.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error joining raid:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to join the raid. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
