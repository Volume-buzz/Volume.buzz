import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import WalletService from '../services/wallet';
import { Command } from '../types';

const depositCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('💳 View your admin wallet address for manual token deposits (Admins only)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check if user has admin permissions
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins can view deposit wallet addresses.\n\nContact a super admin to get admin permissions.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get admin's wallet
      const walletService = new WalletService();
      const adminWallet = await walletService.createOrGetWallet(interaction.user.id, true);

      const embed = EmbedBuilder.createInfoEmbed(
        '💳 Admin Deposit Wallet',
        `**Your Admin Wallet Address:**\n` +
        `\`${adminWallet.publicKey}\`\n\n` +
        `**How to deposit tokens:**\n` +
        `1. Send any SPL tokens to the above address\n` +
        `2. Use \`/tokens add\` to register new token types\n` +
        `3. Create raids with \`/play\` using the token mint address\n\n` +
        `**Supported Networks:**\n` +
        `✅ Solana Mainnet\n` +
        `✅ All SPL Tokens\n\n` +
        `**Security:**\n` +
        `🔐 This wallet is encrypted and stored securely\n` +
        `🗝️ Use \`/wallet\` to export private key if needed\n\n` +
        `*Only deposit tokens you intend to use for raid rewards*`
      );

      embed.setFooter({ 
        text: 'Use /tokens to manage token configurations • Use /play to create raids' 
      });

      await interaction.editReply({ embeds: [embed] });

      console.log(`💳 Admin ${interaction.user.tag} viewed deposit wallet address`);

    } catch (error: any) {
      console.error('Error showing deposit info:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Deposit Error',
        `Failed to load deposit information: ${error.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default depositCommand;
