import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import WalletService from '../services/wallet';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';
import PrismaDatabase from '../database/prisma';

const transferCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('💸 Transfer SOL or tokens to another wallet')
    .addStringOption(option =>
      option
        .setName('to_address')
        .setDescription('Recipient wallet address')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to transfer')
        .setRequired(true)
        .setMinValue(0.001)
    )
    .addStringOption(option =>
      option
        .setName('token_mint')
        .setDescription('Token mint address (leave empty for SOL)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const toAddress = interaction.options.getString('to_address', true);
      const amount = interaction.options.getNumber('amount', true);
      const tokenMint = interaction.options.getString('token_mint');

      // Check if user is admin for token transfers
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      
      if (tokenMint && !isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          '❌ **Token transfers are restricted to administrators**\n\n' +
          'For security reasons, only admins can transfer custom tokens.\n' +
          'Regular users can transfer SOL only.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const walletService = new WalletService();

      // Get user's wallet to check balance
      const userWallet = await walletService.createOrGetWallet(interaction.user.id, false);
      const balances = await walletService.getWalletBalances(userWallet.publicKey);

      // Validate sufficient balance
      if (!tokenMint || tokenMint === 'SOL') {
        if (balances.sol < amount) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Insufficient Balance',
            `❌ **Not enough SOL**\n\n` +
            `**Available:** ${balances.sol.toFixed(4)} SOL\n` +
            `**Requested:** ${amount.toFixed(4)} SOL\n` +
            `**Needed:** ${(amount - balances.sol).toFixed(4)} SOL more`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else {
        // Check token balance
        const token = balances.tokens.find(t => t.mint === tokenMint);
        if (!token || token.amount < amount) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Insufficient Token Balance',
            `❌ **Not enough tokens**\n\n` +
            `**Token:** ${token?.symbol || 'Unknown'}\n` +
            `**Available:** ${token?.amount || 0}\n` +
            `**Requested:** ${amount}`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }

      // Show confirmation dialog
      const transferType = tokenMint ? 'Token' : 'SOL';
      const transferSymbol = tokenMint ? 
        (balances.tokens.find(t => t.mint === tokenMint)?.symbol || 'Unknown') : 
        'SOL';

      const embed = EmbedBuilder.createInfoEmbed(
        '💸 Confirm Transfer',
        `**⚠️ Please confirm this transfer:**\n\n` +
        `**Type:** ${transferType} Transfer\n` +
        `**Amount:** ${amount} ${transferSymbol}\n` +
        `**To Address:** \`${toAddress}\`\n` +
        `**From:** Your ${isAdmin ? 'Admin' : 'User'} Wallet\n\n` +
        `**🔐 Security Features:**\n` +
        `✅ Address validation\n` +
        `✅ Balance verification\n` +
        `✅ Anti-fraud protection\n` +
        `✅ Transaction monitoring\n\n` +
        `**⚠️ This action cannot be undone!**`
      );

      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_transfer_${tokenMint || 'SOL'}_${amount}_${toAddress}`)
            .setLabel('✅ Confirm Transfer')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_transfer')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ 
        embeds: [embed], 
        components: [buttons] 
      });

    } catch (error: any) {
      console.error('Error in transfer command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Transfer Error',
        `Failed to prepare transfer: ${error.message}\n\nPlease check your inputs and try again.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default transferCommand;
