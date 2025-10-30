import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';

const API_BASE = (process.env.API_PUBLIC_URL || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

interface Participant {
  id: string;
  discord_id: string;
  discord_handle?: string | null;
  joined_at: string;
  qualified_at?: string | null;
  claimed_at?: string | null;
  total_listening_duration: number;
  is_listening: boolean;
}

interface ListeningPartyDetail {
  id: string;
  track: {
    id: string;
    title: string;
    artist: string;
    artwork?: string;
  };
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  status: string;
  timing: {
    created_at: string;
    started_at?: string | null;
    ended_at?: string | null;
    expires_at: string;
    duration_minutes: number;
  };
  participants: Participant[];
}

async function fetchActivePartyIds(guildId?: string | null): Promise<string[]> {
  const endpoint = guildId
    ? `/api/listening-parties/active/by-server?server_id=${encodeURIComponent(guildId)}`
    : '/api/listening-parties/active';
  const res = await fetch(`${API_BASE}${endpoint}`);
  if (!res.ok) {
    throw new Error(`Failed to load parties: ${res.status}`);
  }

  const data = (await res.json()) as any;
  if (Array.isArray(data?.parties)) {
    return data.parties.map((p: any) => p.id);
  }
  if (Array.isArray(data)) {
    return data.map((p: any) => p.id);
  }
  return [];
}

async function fetchPartyDetail(id: string): Promise<ListeningPartyDetail | null> {
  const res = await fetch(`${API_BASE}/api/listening-parties/${encodeURIComponent(id)}`);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as unknown;
  return data as ListeningPartyDetail;
}

function formatStatus(participant: Participant): { statusText: string; color: number } {
  if (participant.claimed_at) {
    return { statusText: '✅ Reward claimed', color: 0x10B981 };
  }
  if (participant.qualified_at) {
    return { statusText: '🎉 Qualified – ready to claim', color: 0xFBBF24 };
  }
  return { statusText: '⏳ In progress', color: 0x3B82F6 };
}

function createProgressBar(current: number, required: number, length: number = 10): string {
  const percentage = Math.min(current / required, 1);
  const filled = Math.round(percentage * length);
  const empty = length - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return `${filledBar}${emptyBar} ${Math.round(percentage * 100)}%`;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party-status')
    .setDescription('Show your progress in current listening parties'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const partyIds = await fetchActivePartyIds(interaction.guildId);

      const details = await Promise.all(
        partyIds.map(async (id) => {
          try {
            return await fetchPartyDetail(id);
          } catch {
            return null;
          }
        })
      );

      const myParties = details
        .filter((party): party is ListeningPartyDetail => Boolean(party))
        .map((party) => {
          const participant = party.participants.find(p => p.discord_id === interaction.user.id);
          return participant ? { party, participant } : null;
        })
        .filter((entry): entry is { party: ListeningPartyDetail; participant: Participant } => Boolean(entry));

      if (!myParties.length) {
        const embed = new EmbedBuilder()
          .setColor('#FBBF24')
          .setTitle('No Active Listening Parties')
          .setDescription('You are not currently joined in any listening parties. Use `/party-list` to discover one!');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const QUALIFYING_THRESHOLD = 30; // seconds required to qualify

      const embeds = myParties.map(({ party, participant }) => {
        const { statusText, color } = formatStatus(participant);
        const progressBar = createProgressBar(participant.total_listening_duration, QUALIFYING_THRESHOLD);

        return new EmbedBuilder()
          .setColor(color)
          .setTitle(`${party.track.title || 'Unknown Track'} • Party ${party.id}`)
          .addFields(
            { name: 'Status', value: statusText, inline: false },
            {
              name: 'Listening Progress',
              value: `\`\`\`${progressBar}\`\`\`\n${participant.total_listening_duration}s / ${QUALIFYING_THRESHOLD}s ${participant.is_listening ? '🔊 Currently listening' : ''}`,
              inline: false
            },
            {
              name: 'Reward',
              value: `${party.reward.tokens_per_participant} ${party.reward.token_mint}`,
              inline: true
            },
            {
              name: 'Artist',
              value: party.track.artist || 'Unknown',
              inline: true
            }
          )
          .setFooter({
            text: participant.qualified_at && !participant.claimed_at
              ? 'You\'re qualified! Use the Claim button in /party-list or run /party-claim.'
              : participant.qualified_at
              ? 'Reward already claimed!'
              : `Listen for ${QUALIFYING_THRESHOLD - participant.total_listening_duration}s more to qualify.`
          });
      });

      await interaction.editReply({ embeds });
    } catch (error) {
      console.error('party-status error', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('Error')
        .setDescription('Unable to load your listening party status. Please try again later.');
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
