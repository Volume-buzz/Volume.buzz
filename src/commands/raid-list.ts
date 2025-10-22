import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} from 'discord.js';
import { Command } from '../types';
import PrismaDatabase from '../database/prisma';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-list')
    .setDescription('View all active listening parties in this server')
    .addStringOption(option =>
      option
        .setName('platform')
        .setDescription('Filter by platform')
        .setChoices(
          { name: 'All Platforms', value: 'all' },
          { name: 'Audius', value: 'audius' },
          { name: 'Spotify', value: 'spotify' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const serverId = interaction.guildId;
      const platform = interaction.options.getString('platform') || 'all';

      // Get active listening parties for this server
      let parties = await PrismaDatabase.prisma.listeningParty.findMany({
        where: {
          status: 'ACTIVE',
          expires_at: {
            gt: new Date(),
          },
          // Include parties for this server or global parties
          OR: [
            { }, // This will be handled in code
          ],
        },
        include: {
          participants: {
            select: {
              qualified_at: true,
            },
          },
        },
      });

      // Filter by platform if specified
      if (platform !== 'all') {
        parties = parties.filter(p => p.platform === platform);
      }

      if (parties.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('🎵 No Active Parties')
          .setDescription('There are no active listening parties right now. Come back later!');

        return await interaction.editReply({ embeds: [embed] });
      }

      // Create embeds for each party
      const embeds = parties.slice(0, 5).map(party => {
        const available = party.max_participants - party.claimed_count;
        const full = available === 0;
        const timeRemaining = calculateTimeRemaining(party.expires_at);

        return new EmbedBuilder()
          .setColor(full ? '#999999' : '#4F46E5')
          .setTitle(party.track_title)
          .setAuthor({
            name: `by ${party.track_artist || 'Unknown Artist'}`,
          })
          .addFields(
            {
              name: '🎵 Platform',
              value: party.platform.toUpperCase(),
              inline: true,
            },
            {
              name: '💰 Reward',
              value: `${(Number(party.tokens_per_participant) / 1e6).toFixed(2)}M tokens`,
              inline: true,
            },
            {
              name: '👥 Capacity',
              value: `${party.claimed_count}/${party.max_participants} (${available} available)`,
              inline: true,
            },
            {
              name: '⏰ Time Remaining',
              value: timeRemaining,
              inline: true,
            },
            {
              name: '🆔 Party ID',
              value: `\`${party.id}\``,
              inline: false,
            }
          )
          .setFooter({ text: 'Use /raid-join to join!' });
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('Error fetching parties:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to fetch active parties. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

function calculateTimeRemaining(expiresAt: Date): string {
  const now = new Date();
  const ms = expiresAt.getTime() - now.getTime();

  if (ms <= 0) return '⏰ Expired';

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
