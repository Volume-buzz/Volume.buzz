import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '../types';
import PrismaDatabase from '../database/prisma';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-status')
    .setDescription('Check your participation status in active parties'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const userId = interaction.user.id;

      // Get all active parties with user's participation
      const parties = await PrismaDatabase.prisma.listeningParty.findMany({
        where: {
          status: 'ACTIVE',
          expires_at: {
            gt: new Date(),
          },
        },
        include: {
          participants: {
            where: {
              discord_id: userId,
            },
          },
        },
      });

      // Filter to only parties user is in
      const participations = parties.filter(p => p.participants.length > 0);

      if (participations.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FBBF24')
          .setTitle('📊 No Active Participations')
          .setDescription('You haven\'t joined any active parties yet. Use `/raid-list` to find one!');

        return await interaction.editReply({ embeds: [embed] });
      }

      const embeds = participations.map(party => {
        const participant = party.participants[0];
        const duration = participant?.total_listening_duration || 0;
        const qualified = participant?.qualified_at ? true : false;
        const claimed = participant?.claimed_at ? true : false;
        const progress = Math.min(100, Math.round((duration / 30) * 100));

        let status = '⏳ In Progress';
        if (claimed) status = '✅ Claimed';
        else if (qualified) status = '🎉 Qualified';

        const progressBar = createProgressBar(progress);

        return new EmbedBuilder()
          .setColor(qualified ? '#10B981' : '#3B82F6')
          .setTitle(`${party.track_title} by ${party.track_artist || 'Unknown'}`)
          .addFields(
            { name: '📊 Status', value: status, inline: true },
            {
              name: '⏱️ Listening Time',
              value: `${duration}/30 seconds`,
              inline: true,
            },
            {
              name: '📈 Progress',
              value: progressBar,
              inline: false,
            }
          );

        if (qualified && !claimed) {
          embed.addFields({
            name: '🎯 Next Step',
            value: 'Use `/raid-claim` to get your tokens!',
          });
        }

        return embed;
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('Error fetching status:', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to fetch your participation status.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

function createProgressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percent}%`;
}
