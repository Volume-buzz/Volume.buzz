import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { PublicKey, Connection } from '@solana/web3.js';
import config from '../config/environment';
import { Command } from '../types';

const checkWalletCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('check-wallet')
    .setDescription('🔍 Check if any wallet address has specific tokens (Debug tool)')
    .addStringOption(option =>
      option.setName('wallet_address')
        .setDescription('Wallet address to check')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('token_mint')
        .setDescription('Specific token mint to look for (optional)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Admin only for debugging
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins can use debug tools.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const walletAddress = interaction.options.getString('wallet_address', true);
      const tokenMint = interaction.options.getString('token_mint');

      // Validate wallet address
      try {
        new PublicKey(walletAddress);
      } catch {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Address',
          'Please provide a valid Solana wallet address.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const connection = new Connection(config.solana.rpcUrl, 'confirmed');
      const pubKey = new PublicKey(walletAddress);

      // Get SOL balance
      const solBalance = await connection.getBalance(pubKey);
      const solAmount = solBalance / 1e9;

      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });

      let description = `**Wallet:** \`${walletAddress}\`\n**SOL Balance:** ${solAmount.toFixed(4)} SOL\n**Token Accounts:** ${tokenAccounts.value.length}\n\n`;

      if (tokenAccounts.value.length === 0) {
        description += `❌ **No SPL token accounts found**\n\nThis wallet has never received any SPL tokens.`;
      } else {
        description += `**SPL Tokens Found:**\n`;
        
        for (const tokenAccount of tokenAccounts.value) {
          const mintAddress = tokenAccount.account.data.parsed.info.mint;
          const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
          
          if (tokenAmount.uiAmount > 0) {
            const tokenData = await PrismaDatabase.getTokenByMint(mintAddress);
            const symbol = tokenData?.symbol || 'UNKNOWN';
            
            description += `✅ **${symbol}**: ${tokenAmount.uiAmount} tokens\n`;
            description += `   Mint: \`${mintAddress}\`\n\n`;
            
            // Highlight if this is the token they're looking for
            if (tokenMint && mintAddress === tokenMint) {
              description += `🎯 **FOUND YOUR TARGET TOKEN!**\n\n`;
            }
          }
        }
      }

      const embed = EmbedBuilder.createInfoEmbed('🔍 Wallet Debug Info', description);
      await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
      console.error('Error checking wallet:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Check Failed',
        `Failed to check wallet: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default checkWalletCommand;
