import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { apiGet, ApiError, SessionContext } from '../lib/apiClient';

interface RaidParticipation {
  id: number;
  qualified: boolean;
  claimed_reward: boolean;
  total_listen_duration: number;
  raid: {
    id: number;
    track_title?: string | null;
    track_artist?: string | null;
    required_listen_time?: number | null;
  } | null;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('raid-status')
    .setDescription('Check your participation status in active raids'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
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

      if (participations.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#FBBF24')
          .setTitle('📊 No Active Participations')
          .setDescription('You haven\'t joined any active raids yet. Use `/raid-list` to find one!');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embeds = participations.map((participation) => {
        const duration = participation.total_listen_duration || 0;
        const requiredDuration = participation.raid?.required_listen_time ?? 30;
        const qualified = participation.qualified;
        const claimed = participation.claimed_reward;
        const progress = Math.min(100, Math.round((duration / requiredDuration) * 100));

        let status = '⏳ In Progress';
        if (claimed) status = '✅ Claimed';
        else if (qualified) status = '🎉 Qualified';

        const progressBar = createProgressBar(progress);

        const embed = new EmbedBuilder()
          .setColor(qualified ? '#10B981' : '#3B82F6')
          .setTitle(`${participation.raid?.track_title || 'Unknown Track'} • Raid #${participation.raid?.id ?? participation.id}`)
          .addFields(
            { name: '📊 Status', value: status, inline: true },
            {
              name: '⏱️ Listening Time',
              value: `${duration}/${requiredDuration} seconds`,
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
            value: 'Use `/raid-claim raid-id:<id>` to receive your reward.',
          });
        }

        return embed;
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('Error fetching status:', error);
      const description =
        error instanceof ApiError
          ? `API responded with status ${error.status}: ${error.message}`
          : 'Failed to fetch your participation status.';
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription(description);

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

export default command;
