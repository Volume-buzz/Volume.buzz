import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { apiGet, ApiError, SessionContext } from '../lib/apiClient';

interface CreatorListeningParty {
  id: string;
  track: {
    id: string;
    title: string;
    artist: string;
    artwork: string | null;
  };
  platform: string;
  status: string;
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  capacity: {
    max: number;
    claimed: number;
    participants: number;
    qualified: number;
  };
  timing: {
    created_at: string;
    expires_at: string;
    duration_minutes: number;
  };
}

function formatStatus(status: string, expiresAt: string): string {
  const normalized = status.toUpperCase();
  if (normalized !== 'ACTIVE') {
    return normalized;
  }

  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(msRemaining)) {
    return 'ACTIVE';
  }

  if (msRemaining <= 0) {
    return 'EXPIRED';
  }

  const minutes = Math.floor(msRemaining / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `ACTIVE • ${hours}h ${minutes % 60}m left`;
  }
  return `ACTIVE • ${minutes}m left`;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party-my-parties')
    .setDescription('Show listening parties you created'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const sessionContext: SessionContext = {
      discordId: interaction.user.id,
      username: interaction.user.username,
      displayName: interaction.user.globalName ?? interaction.user.displayName ?? undefined,
      avatarUrl: interaction.user.displayAvatarURL()
    };

    try {
      const parties = await apiGet<CreatorListeningParty[]>(sessionContext, '/api/listening-parties/artist/my-parties');

      if (!parties.length) {
        const embed = new EmbedBuilder()
          .setColor('#4F46E5')
          .setTitle('No Listening Parties')
          .setDescription('You have not created any listening parties yet. Use the Volume dashboard to launch one.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embeds = parties.slice(0, 5).map(party => {
        const embed = new EmbedBuilder()
          .setColor(party.status === 'ACTIVE' ? 0x10B981 : 0x6366F1)
          .setTitle(`${party.track.title || 'Untitled Track'} • ${party.platform.toUpperCase()}`)
          .addFields(
            {
              name: 'Party ID',
              value: `\`${party.id}\``,
              inline: false
            },
            {
              name: 'Status',
              value: formatStatus(party.status, party.timing.expires_at),
              inline: true
            },
            {
              name: 'Reward',
              value: `${party.reward.tokens_per_participant} ${party.reward.token_mint}`,
              inline: true
            },
            {
              name: 'Participation',
              value: `${party.capacity.participants}/${party.capacity.max} joined • ${party.capacity.qualified} qualified • ${party.capacity.claimed} claimed`,
              inline: false
            },
            {
              name: 'Expires',
              value: new Date(party.timing.expires_at).toLocaleString(),
              inline: true
            }
          );

        if (party.track.artwork) {
          embed.setThumbnail(party.track.artwork);
        }

        return embed;
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('party-my-parties error', error);
      if (error instanceof ApiError) {
        await interaction.editReply(`Failed to load your listening parties: ${error.message}`);
        return;
      }
      await interaction.editReply('An unexpected error occurred while loading your listening parties.');
    }
  }
};

export default command;
