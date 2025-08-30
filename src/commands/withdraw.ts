import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import WalletService from '../services/wallet';
import { Command } from '../types';

const withdrawCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('💸 Withdraw your tokens to an external Solana wallet')
    .addStringOption(option =>
      option.setName('to_address')
        .setDescription('Solana wallet address to send tokens to')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('Amount in SOL equivalent to withdraw (minimum: 1.0 SOL)')
        .setRequired(true)
        .setMinValue(1.0)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const toAddress = interaction.options.getString('to_address', true);
      const amount = interaction.options.getNumber('amount', true);

      // Validate Solana address format
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(toAddress)) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Address',
          'Please provide a valid Solana wallet address.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if user has a wallet
      const walletService = new WalletService();
      const userWallet = await walletService.createOrGetWallet(interaction.user.id, false);
      const balances = await walletService.getWalletBalances(userWallet.publicKey);

      // Calculate total SOL equivalent
      const jupiterApi = require('../services/jupiterApi').default;
      const solPrice = await jupiterApi.getTokenPrice('So11111111111111111111111111111111111111112');
      let totalSOLEquivalent = balances.sol;
      
      for (const token of balances.tokens) {
        const tokenPrice = await jupiterApi.getTokenPrice(token.mint);
        if (tokenPrice && solPrice) {
          const tokenValueSOL = (token.amount * tokenPrice) / solPrice;
          totalSOLEquivalent += tokenValueSOL;
        }
      }

      // Check wallet permissions and limits
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      
      // Fan wallets have 1 SOL minimum withdrawal limit
      if (!isAdmin && amount < 1.0) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Minimum Withdrawal',
          `❌ **Fan wallets require minimum 1.0 SOL withdrawal**\n\n` +
          `**Your Type:** 👤 Fan Wallet\n` +
          `**Minimum:** 1.0 SOL equivalent\n` +
          `**Requested:** ${amount.toFixed(4)} SOL equivalent\n\n` +
          `Admins can withdraw any amount. Contact an admin to upgrade your wallet type.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if user has enough balance
      if (totalSOLEquivalent < amount) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Insufficient Balance',
          `❌ **Not enough tokens to withdraw**\n\n` +
          `**Available:** ${totalSOLEquivalent.toFixed(4)} SOL equivalent\n` +
          `**Requested:** ${amount.toFixed(4)} SOL equivalent\n` +
          `**Needed:** ${(amount - totalSOLEquivalent).toFixed(4)} SOL more\n` +
          `**Wallet Type:** ${isAdmin ? '👑 Admin (no limits)' : '👤 Fan (1 SOL minimum)'}\n\n` +
          `Participate in more raids to earn tokens!`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check for existing pending withdrawals
      const pendingWithdrawals = await PrismaDatabase.getPendingWithdrawals(interaction.user.id);
      if (pendingWithdrawals.length > 0) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Withdrawal Pending',
          `❌ **You already have a pending withdrawal**\n\n` +
          `**Withdrawal ID:** ${pendingWithdrawals[0].id}\n` +
          `**Amount:** ${pendingWithdrawals[0].requested_amount_sol} SOL\n` +
          `**Status:** Processing\n\n` +
          `Please wait for your current withdrawal to complete before requesting another.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create withdrawal request
      const withdrawal = await PrismaDatabase.createWithdrawal({
        userDiscordId: interaction.user.id,
        toAddress,
        requestedAmountSol: amount.toString(),
        route: 'SOL'
      });

      const embed = EmbedBuilder.createSuccessEmbed(
        'Withdrawal Requested',
        `✅ **Your withdrawal request has been submitted!**\n\n` +
        `💸 **Amount:** ${amount.toFixed(4)} SOL equivalent\n` +
        `📮 **To Address:** \`${toAddress}\`\n` +
        `🆔 **Withdrawal ID:** \`${withdrawal.id}\`\n` +
        `📊 **Status:** 🟡 Processing\n\n` +
        `**What happens next:**\n` +
        `1. Our system will process your withdrawal\n` +
        `2. Tokens will be converted to SOL if needed\n` +
        `3. SOL will be sent to your specified address\n` +
        `4. You'll receive a confirmation DM\n\n` +
        `**Processing Time:** Usually 5-15 minutes\n` +
        `**Network Fee:** ~0.001 SOL (deducted from withdrawal)`
      );

      embed.setFooter({ 
        text: `Withdrawal ID: ${withdrawal.id} • Check /account for status updates` 
      });

      await interaction.editReply({ embeds: [embed] });

      console.log(`💸 Withdrawal requested: ${interaction.user.tag} wants to withdraw ${amount} SOL to ${toAddress} (ID: ${withdrawal.id})`);

    } catch (error: any) {
      console.error('Error processing withdrawal:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Withdrawal Failed',
        `Failed to process withdrawal request: ${error.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default withdrawCommand;
