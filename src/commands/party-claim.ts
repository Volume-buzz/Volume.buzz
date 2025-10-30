import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';
import { Command } from '../types';

const API_BASE = (process.env.API_PUBLIC_URL || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface Participant {
  id: string;
  discord_id: string;
  qualified_at?: string | null;
  claimed_at?: string | null;
  total_listening_duration: number;
}

interface ListeningPartyDetail {
  id: string;
  track: {
    title: string;
    artist: string;
  };
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  participants: Participant[];
}

async function fetchPartyDetail(id: string): Promise<ListeningPartyDetail | null> {
  const res = await fetch(`${API_BASE}/api/listening-parties/${encodeURIComponent(id)}`);
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as unknown;
  return data as ListeningPartyDetail;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('party-claim')
    .setDescription('Get a link to claim your listening party rewards')
    .addStringOption(option =>
      option
        .setName('party-id')
        .setDescription('Listening party ID')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const partyId = interaction.options.getString('party-id', true);
    const discordId = interaction.user.id;

    try {
      // Check if wallet is connected
      const walletRes = await fetch(`${API_BASE}/api/wallet/status/${discordId}`);
      if (!walletRes.ok) {
        throw new Error('Failed to check wallet status');
      }

      const walletData = await walletRes.json() as { connected: boolean };

      if (!walletData.connected) {
        // Generate wallet connection URL
        const connectRes = await fetch(`${API_BASE}/api/wallet/connect-url?discord_id=${discordId}`);
        const connectData = await connectRes.json() as { connect_url: string };

        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('🔗 Wallet Not Connected')
          .setDescription('You need to connect your Solana wallet before claiming rewards.')
          .addFields({
            name: 'Connect Your Wallet',
            value: `Click the link below to connect:\n${connectData.connect_url}`,
            inline: false
          })
          .setFooter({ text: 'After connecting, come back and run this command again.' });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get party details
      const party = await fetchPartyDetail(partyId);
      if (!party) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Party Not Found')
          .setDescription('Could not find that listening party. Verify the ID and try again.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check participant status
      const participant = party.participants.find(p => p.discord_id === discordId);
      if (!participant) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ Not Joined')
          .setDescription('You did not join this listening party. Use `/party-list` to find active parties.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (!participant.qualified_at) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('⏳ Not Qualified Yet')
          .setDescription(
            `You must listen for at least 30 seconds before claiming.\n\n` +
            `**Current Progress:** ${participant.total_listening_duration}s / 30s`
          )
          .setFooter({ text: 'Keep listening to qualify for rewards!' });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (participant.claimed_at) {
        const embed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('✅ Already Claimed')
          .setDescription('You have already claimed this reward!')
          .setFooter({ text: 'Check your wallet for your tokens.' });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Generate claim URL
      const claimUrl = `${APP_URL}/claim/${partyId}?discordId=${discordId}`;

      const embed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('🎁 Ready to Claim!')
        .setDescription(
          `You're qualified to claim rewards for **${party.track.title}**!\n\n` +
          `Click the link below to claim your tokens:`
        )
        .addFields(
          { name: 'Reward', value: `${party.reward.tokens_per_participant} ${party.reward.token_mint}`, inline: true },
          { name: 'Artist', value: party.track.artist || 'Unknown', inline: true },
          { name: 'Claim Link', value: claimUrl, inline: false }
        )
        .setFooter({ text: 'You\'ll need to sign a transaction with your wallet to receive the tokens.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('party-claim error', error);
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Something went wrong. Please try again later.');
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
