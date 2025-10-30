import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import fetch from 'node-fetch';
import { Command } from '../types';

const API_BASE = (process.env.API_PUBLIC_URL || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

interface ListeningPartySummary {
  id: string;
  track: {
    id: string;
    title: string;
    artist: string;
    artwork?: string;
  };
  platform: string;
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  capacity: {
    max: number;
    claimed: number;
    available: number;
  };
  timing: {
    expires_at: string;
    duration_minutes: number;
  };
}

interface ActivePartiesResponse {
  count: number;
  parties: ListeningPartySummary[];
  server_id?: string;
}

async function fetchActiveParties(guildId?: string | null): Promise<ListeningPartySummary[]> {
  const endpoint = guildId
    ? `/api/listening-parties/active/by-server?server_id=${encodeURIComponent(guildId)}`
    : '/api/listening-parties/active';

  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    throw new Error(`API request failed with status ${res.status}`);
  }

  const data = await res.json();
  if (Array.isArray(data)) {
    return data;
  }

  const typed = data as ActivePartiesResponse;
  return typed.parties ?? [];
}

function formatTimeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (Number.isNaN(diff)) return 'Unknown';
  if (diff <= 0) return 'Expired';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party-list')
    .setDescription('Show active listening parties you can join'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const parties = await fetchActiveParties(interaction.guildId);

      if (!parties.length) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('No Active Listening Parties')
          .setDescription('There are no active listening parties right now. Check back soon!');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Show up to 3 parties with buttons (Discord limit for action rows)
      const partiesToShow = parties.slice(0, 3);

      const embeds = partiesToShow.map((party) => {
        const reward = party.reward?.tokens_per_participant ?? '0';
        const rewardDisplay = reward ? `${reward} ${party.reward?.token_mint ?? ''}`.trim() : 'N/A';

        return new EmbedBuilder()
          .setColor('#4F46E5')
          .setTitle(party.track?.title ?? 'Listening Party')
          .setAuthor({ name: party.track?.artist ? `by ${party.track.artist}` : 'Listening Party' })
          .addFields(
            { name: 'Platform', value: party.platform.toUpperCase(), inline: true },
            { name: 'Reward', value: rewardDisplay, inline: true },
            {
              name: 'Capacity',
              value: `${party.capacity.claimed}/${party.capacity.max} (${party.capacity.available} spots left)`,
              inline: true
            },
            { name: 'Duration', value: `${party.timing.duration_minutes} minutes`, inline: true },
            { name: 'Time Remaining', value: formatTimeRemaining(party.timing.expires_at), inline: true },
            { name: 'Party ID', value: `\`${party.id}\``, inline: false }
          )
          .setFooter({ text: 'Use the buttons below to interact with this party.' });
      });

      // Create action rows with buttons for each party
      const components = partiesToShow.map((party) => {
        const trackUrl = party.platform === 'audius'
          ? `https://audius.co/tracks/${party.track.id}`
          : `https://open.spotify.com/track/${party.track.id}`;

        return new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('🎵 Play')
            .setStyle(ButtonStyle.Link)
            .setURL(trackUrl),
          new ButtonBuilder()
            .setCustomId(`listen_${party.id}`)
            .setLabel('👂 Listen')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`claim_${party.id}`)
            .setLabel('🎁 Claim')
            .setStyle(ButtonStyle.Success)
        );
      });

      await interaction.editReply({ embeds, components });
    } catch (error) {
      console.error('party-list error', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('Error')
        .setDescription('Failed to load active listening parties. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
