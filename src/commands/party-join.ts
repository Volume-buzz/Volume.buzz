import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from '../types';

const API_BASE = (process.env.API_PUBLIC_URL || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

interface JoinResponse {
  participant_id: string;
  party_id: string;
  discord_id: string;
  joined_at: string;
  qualifying_duration_seconds: number;
}

interface PartyDetail {
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
  capacity: {
    max: number;
    claimed: number;
    available: number;
  };
  timing: {
    duration_minutes: number;
    expires_at: string;
  };
}

async function fetchParty(id: string): Promise<PartyDetail | null> {
  const res = await fetch(`${API_BASE}/api/listening-parties/${encodeURIComponent(id)}`);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as unknown;
  return data as PartyDetail;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party-join')
    .setDescription('Join an active listening party')
    .addStringOption(option =>
      option
        .setName('party-id')
        .setDescription('Listening party ID (see /party-list)')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const partyId = interaction.options.getString('party-id', true);
    const discordId = interaction.user.id;

    try {
      const res = await fetch(`${API_BASE}/api/listening-parties/${encodeURIComponent(partyId)}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_id: discordId,
          discord_handle: interaction.user.username,
          server_id: interaction.guildId ?? undefined
        })
      });

      if (res.status === 404) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('Party Not Found')
          .setDescription('That listening party no longer exists.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (res.status === 400) {
        const payload = (await res.json().catch(() => ({}))) as any;
        const message = typeof payload?.error === 'string' ? payload.error : 'You cannot join this party.';
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('Unable to Join')
          .setDescription(message);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!res.ok) {
        throw new Error(`API responded with status ${res.status}`);
      }

      const joinData = (await res.json()) as JoinResponse;
      const party = await fetchParty(partyId);

      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('Joined Listening Party')
        .setDescription('You successfully joined the listening party!')
        .addFields(
          {
            name: 'Track',
            value: party?.track?.title
              ? `${party.track.title} by ${party.track.artist || 'Unknown Artist'}`
              : 'Unknown Track',
            inline: false
          },
          {
            name: 'Reward',
            value: party?.reward
              ? `${party.reward.tokens_per_participant} ${party.reward.token_mint}`
              : 'N/A',
            inline: true
          },
          {
            name: 'Listen Time Required',
            value: `${joinData.qualifying_duration_seconds} seconds`,
            inline: true
          },
          {
            name: 'Party ID',
            value: `\`${joinData.party_id}\``,
            inline: false
          }
        )
        .setFooter({ text: 'Keep listening and use /party-claim once you have your transaction signature.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('party-join error', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('Error')
        .setDescription('Failed to join the listening party. Please try again later.');
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
