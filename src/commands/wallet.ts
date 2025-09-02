import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import WalletService from '../services/wallet';
import { Command } from '../types';

const walletCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('💰 View your Solana wallet and token balances'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const walletService = new WalletService();
      const jupiterApi = require('../services/jupiterApi').default;

      // Get or create user wallet
      const cryptoWallet = await walletService.createOrGetWallet(interaction.user.id, false);
      const balances = await walletService.getWalletBalances(cryptoWallet.publicKey);

      // Calculate total SOL equivalent
      const solPrice = await jupiterApi.getTokenPrice('So11111111111111111111111111111111111111112');
      let totalSOLEquivalent = balances.sol;
      
      const tokenDetails: string[] = [];
      
      for (const token of balances.tokens) {
        const tokenPrice = await jupiterApi.getTokenPrice(token.mint);
        if (tokenPrice && solPrice) {
          const tokenValueSOL = (token.amount * tokenPrice) / solPrice;
          totalSOLEquivalent += tokenValueSOL;
        }
        tokenDetails.push(`${token.symbol}: ${token.amount.toFixed(2)} ${token.symbol}`);
      }

      // Get user info for role display
      const user = await PrismaDatabase.getUser(interaction.user.id);
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      const role = isAdmin ? 'Super Admin' : (user?.role === 'ARTIST' ? 'Artist' : 'Fan');

      const embed = EmbedBuilder.createInfoEmbed(
        '💰 Your Solana Wallet',
        `**Address:** \`${cryptoWallet.publicKey}\`\n\n` +
        `**💳 Token Balances**\n` +
        `SOL: ${balances.sol.toFixed(4)} SOL\n` +
        `${tokenDetails.length > 0 ? tokenDetails.join('\n') : 'No SPL tokens found'}\n\n` +
        `**💎 Portfolio Value**\n` +
        `${totalSOLEquivalent.toFixed(4)} SOL equivalent total\n\n` +
        `**🔑 Wallet Type**\n` +
        `${role === 'Super Admin' ? '👑' : role === 'Artist' ? '🎨' : '👤'} ${role} Wallet`
      );

      // Safe action buttons only
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('view_transactions')
            .setLabel('📋 View Transactions')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('wallet_coming_soon')
            .setLabel('💸 Transfers - Coming Soon')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

      embed.setFooter({ text: 'Secure wallet features coming soon! Use /wallet to view your portfolio 📊' });

      await interaction.editReply({ 
        embeds: [embed],
        components: [buttons]
      });

    } catch (error: any) {
      console.error('Error showing wallet:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Wallet Error',
        `Failed to load wallet information: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default walletCommand;
