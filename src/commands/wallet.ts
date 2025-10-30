import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Command } from '../types';

const API_BASE = (process.env.API_PUBLIC_URL || process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface WalletStatusResponse {
  connected: boolean;
  wallet_address: string | null;
  privy_user_id?: string;
}

interface WalletBalanceResponse {
  wallet_address: string;
  balances: {
    sol: number;
    tokens: Array<{
      mint: string;
      amount: number;
      decimals: number;
    }>;
  };
}

interface ConnectUrlResponse {
  connect_url: string;
  state: string;
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('View or connect your Solana wallet'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const discordId = interaction.user.id;

      // Check wallet status
      const statusRes = await fetch(`${API_BASE}/api/wallet/status/${discordId}`);
      if (!statusRes.ok) {
        throw new Error(`Failed to check wallet status: ${statusRes.status}`);
      }

      const walletStatus = await statusRes.json() as WalletStatusResponse;

      // If not connected, provide connection link
      if (!walletStatus.connected) {
        const connectRes = await fetch(
          `${API_BASE}/api/wallet/connect-url?discord_id=${discordId}`
        );

        if (!connectRes.ok) {
          throw new Error(`Failed to generate connection URL: ${connectRes.status}`);
        }

        const connectData = await connectRes.json() as ConnectUrlResponse;

        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('🔗 Connect Your Wallet')
          .setDescription(
            'You don\'t have a wallet connected yet. Connect your Solana wallet to claim rewards from listening parties!'
          )
          .addFields(
            {
              name: 'Connect Now',
              value: `[Click here to connect your wallet](${connectData.connect_url})`,
              inline: false
            },
            {
              name: 'How to Connect',
              value:
                '1. Click the link above\n' +
                '2. Sign in with Privy\n' +
                '3. Connect or create a Solana wallet\n' +
                '4. Return to Discord and run `/wallet` again',
              inline: false
            }
          )
          .setFooter({ text: 'Your connection link expires in 15 minutes' });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Wallet is connected - fetch balance
      const balanceRes = await fetch(`${API_BASE}/api/wallet/balance/${discordId}`);

      if (!balanceRes.ok) {
        // Wallet connected but can't fetch balance - show wallet address only
        const embed = new EmbedBuilder()
          .setColor('#4F46E5')
          .setTitle('💰 Your Wallet')
          .addFields(
            { name: 'Status', value: '✅ Connected', inline: true },
            { name: 'Wallet Address', value: `\`${walletStatus.wallet_address}\``, inline: false }
          )
          .setDescription('*Unable to fetch balance at this time*')
          .setFooter({ text: 'Use this wallet to claim listening party rewards!' });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const balanceData = await balanceRes.json() as WalletBalanceResponse;

      // Format SOL balance
      const solBalance = balanceData.balances.sol.toFixed(4);

      const embed = new EmbedBuilder()
        .setColor('#4F46E5')
        .setTitle('💰 Your Wallet')
        .addFields(
          { name: 'Status', value: '✅ Connected', inline: true },
          { name: 'SOL Balance', value: `${solBalance} SOL`, inline: true },
          { name: 'Wallet Address', value: `\`${balanceData.wallet_address}\``, inline: false }
        );

      // Add token balances if any
      if (balanceData.balances.tokens && balanceData.balances.tokens.length > 0) {
        const tokenList = balanceData.balances.tokens
          .slice(0, 5) // Show max 5 tokens
          .map(token => {
            const amount = (token.amount / Math.pow(10, token.decimals)).toFixed(2);
            return `${amount} (${token.mint.slice(0, 8)}...)`;
          })
          .join('\n');

        embed.addFields({
          name: 'Token Balances',
          value: tokenList || 'No tokens',
          inline: false
        });
      }

      embed.setFooter({ text: 'Use this wallet to claim listening party rewards!' });

      // Add disconnect button
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disconnect_wallet')
            .setLabel('Disconnect Wallet')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔓')
        );

      await interaction.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
      console.error('wallet command error', error);

      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('❌ Error')
        .setDescription('Failed to load wallet information. Please try again later.');

      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default command;
