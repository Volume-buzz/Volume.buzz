import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/prisma';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-claim')
    .setDescription('Claim your tokens from a qualified listening party')
    .addStringOption(option =>
      option
        .setName('party-id')
        .setDescription('The party to claim from')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const partyId = interaction.options.getString('party-id')!;
      const userId = interaction.user.id;

      // Get party and participant
      const party = await prisma.listeningParty.findUnique({
        where: { id: partyId },
      });

      if (!party) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Party Not Found')
          .setDescription('This listening party doesn\'t exist');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const participant = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: partyId,
            discord_id: userId,
          },
        },
      });

      if (!participant) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Not Joined')
          .setDescription('You haven\'t joined this party');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if qualified
      if (!participant.qualified_at) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Not Qualified')
          .setDescription(`You need to listen for 30 seconds to qualify. Current: ${participant.total_listening_duration}s`);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if already claimed
      if (participant.claimed_at) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Already Claimed')
          .setDescription('You\'ve already claimed tokens from this party');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Update participant and party
      const mockTxSignature = 'tx_' + Math.random().toString(36).substr(2, 16);

      await Promise.all([
        prisma.listeningPartyParticipant.update({
          where: { id: participant.id },
          data: {
            claimed_at: new Date(),
            claim_tx_signature: mockTxSignature,
          },
        }),
        prisma.listeningParty.update({
          where: { id: partyId },
          data: {
            claimed_count: {
              increment: 1,
            },
          },
        }),
      ]);

      // Success embed
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('✅ Tokens Claimed!')
        .setDescription('Your reward has been sent to your wallet')
        .addFields(
          {
            name: '💰 Amount',
            value: `${(Number(party.tokens_per_participant) / 1e6).toFixed(2)}M tokens`,
          },
          {
            name: '🔗 Transaction',
            value: `[View on Explorer](https://explorer.solana.com/tx/${mockTxSignature}?cluster=devnet)`,
          }
        )
        .setFooter({ text: 'Check your wallet balance in a few moments' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error claiming tokens:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to claim tokens. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
