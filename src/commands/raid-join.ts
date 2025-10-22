import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/prisma';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-join')
    .setDescription('Join a listening party')
    .addStringOption(option =>
      option
        .setName('party-id')
        .setDescription('The party ID to join')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const partyId = interaction.options.getString('party-id')!;
      const userId = interaction.user.id;

      // Check if party exists and is active
      const party = await prisma.listeningParty.findUnique({
        where: { id: partyId },
        include: {
          participants: true,
        },
      });

      if (!party) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Party Not Found')
          .setDescription('This listening party doesn\'t exist');
        return await interaction.editReply({ embeds: [embed] });
      }

      if (party.status !== 'ACTIVE' || party.expires_at < new Date()) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Party Expired')
          .setDescription('This party has expired');
        return await interaction.editReply({ embeds: [embed] });
      }

      if (party.claimed_count >= party.max_participants) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Party Full')
          .setDescription('This party has reached maximum participants');
        return await interaction.editReply({ embeds: [embed] });
      }

      // Check if already joined
      const existing = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: partyId,
            discord_id: userId,
          },
        },
      });

      if (existing) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Already Joined')
          .setDescription('You\'ve already joined this party');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create participant
      const participant = await prisma.listeningPartyParticipant.create({
        data: {
          party_id: partyId,
          discord_id: userId,
          discord_handle: interaction.user.username,
          joined_at: new Date(),
        },
      });

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('✅ Successfully Joined!')
        .setDescription(`You've joined the listening party for "${party.track_title}"`)
        .addFields(
          {
            name: '🎵 Track',
            value: `${party.track_title} by ${party.track_artist || 'Unknown'}`,
            inline: false,
          },
          {
            name: '📋 What to Do',
            value: '1. Listen to the track for at least **30 seconds**\n2. We\'ll verify your listening in real-time\n3. Once qualified, use `/raid-claim` to get your reward!',
            inline: false,
          },
          {
            name: '💰 Reward',
            value: `${(Number(party.tokens_per_participant) / 1e6).toFixed(2)}M tokens`,
            inline: true,
          },
          {
            name: '⏱️ Duration',
            value: `${party.duration_minutes} minutes`,
            inline: true,
          }
        )
        .setFooter({ text: 'Your listening time is being tracked...' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error joining party:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to join party. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
