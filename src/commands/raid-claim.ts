import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { apiGet, apiPost, ApiError, SessionContext } from '../lib/apiClient';

interface RaidDetails {
  id: number;
  track_title?: string | null;
  track_artist?: string | null;
  reward_amount: number;
  token_mint: string;
  required_listen_time: number;
}

interface RaidParticipation {
  id: number;
  raid_id: number;
  qualified: boolean;
  claimed_reward: boolean;
  claimed_at?: string | null;
  total_listen_duration: number;
  raid: RaidDetails;
}

interface ClaimResponse {
  success: boolean;
  amount: number;
  token_mint: string;
  transaction_hash?: string;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-claim')
    .setDescription('Claim your reward from a completed raid')
    .addStringOption(option =>
      option
        .setName('raid-id')
        .setDescription('The raid ID to claim')
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

      const participations = await apiGet<RaidParticipation[]>(
        sessionContext,
        '/api/raids/mine/list'
      );

      const participation = participations.find(
        p => p.raid?.id?.toString() === raidId || p.raid_id?.toString() === raidId
      );

      if (!participation) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Not Eligible')
          .setDescription('You did not participate in this raid.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let raid = participation.raid;

      if (!raid) {
        try {
          raid = await apiGet<RaidDetails>(
            sessionContext,
            `/api/raids/${encodeURIComponent(raidId)}`
          );
        } catch {
          raid = {
            id: Number(raidId),
            track_title: undefined,
            track_artist: undefined,
            reward_amount: 0,
            token_mint: 'TOKEN',
            required_listen_time: 30
          };
        }
      }

      if (!participation.qualified) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Not Qualified')
          .setDescription(
            `You need to listen for at least ${raid.required_listen_time} seconds.\n` +
            `Your recorded time: ${participation.total_listen_duration} seconds.`
          );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (participation.claimed_reward) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Already Claimed')
          .setDescription('You have already claimed this raid reward.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let claimResult: ClaimResponse;

      try {
        claimResult = await apiPost<ClaimResponse>(
          sessionContext,
          `/api/raids/${encodeURIComponent(raidId)}/claim`,
          {}
        );
      } catch (error) {
        if (error instanceof ApiError) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ Claim Failed')
            .setDescription(error.message);
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        throw error;
      }

      const amountValue = Number(claimResult.amount);
      const amountDisplay = Number.isFinite(amountValue)
        ? `${amountValue.toLocaleString()} ${claimResult.token_mint}`
        : `${claimResult.amount} ${claimResult.token_mint}`;

      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('✅ Reward Claimed!')
        .setDescription(
          `Your reward for **${raid.track_title || 'the raid'}** has been queued for settlement.`
        )
        .addFields(
          {
            name: '💰 Amount',
            value: amountDisplay,
          },
          {
            name: '📈 Listening Time',
            value: `${participation.total_listen_duration} seconds`,
            inline: true,
          },
          {
            name: '🎧 Required',
            value: `${raid.required_listen_time} seconds`,
            inline: true,
          }
        )
        .setFooter({ text: claimResult.transaction_hash ? `Transaction: ${claimResult.transaction_hash}` : 'Tokens will appear in your wallet shortly.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error claiming raid reward:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to process the claim. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
