import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import WalletService from '../services/wallet';
import { Command } from '../types';

const regenerateWalletCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('regenerate-wallet')
    .setDescription('🔄 Regenerate your Solana wallet (fixes corrupted wallets)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check if user has a wallet
      const existingWallet = await PrismaDatabase.getUserWallet(interaction.user.id);
      
      if (!existingWallet) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Wallet Found',
          'You don\'t have a wallet yet. It will be created automatically when you use `/wallet`.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create confirmation buttons
      const confirmButton = new ButtonBuilder()
        .setCustomId('confirm_regenerate')
        .setLabel('Yes, Regenerate Wallet')
        .setStyle(ButtonStyle.Danger);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_regenerate')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(confirmButton, cancelButton);

      // Warning about losing access to old wallet
      const embed = EmbedBuilder.createErrorEmbed(
        '⚠️ Wallet Regeneration Warning',
        `**⚠️ IMPORTANT WARNING ⚠️**\n\n` +
        `Regenerating your wallet will:\n` +
        `❌ Create a completely new wallet address\n` +
        `❌ You'll lose access to your current wallet\n` +
        `❌ Any tokens in your current wallet will be inaccessible\n\n` +
        `**Current Wallet:** \`${existingWallet.public_key}\`\n\n` +
        `**Before proceeding:**\n` +
        `1. Check if you have any tokens in this wallet\n` +
        `2. Transfer them out if you want to keep them\n` +
        `3. Only regenerate if your wallet is corrupted\n\n` +
        `**Click a button below to confirm or cancel**`
      );

      const message = await interaction.editReply({ embeds: [embed], components: [row] });

      // Wait for button interaction
      try {
        const collector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000, // 60 seconds
          filter: (i) => i.user.id === interaction.user.id
        });

        collector.on('collect', async (buttonInteraction) => {
          if (buttonInteraction.customId === 'confirm_regenerate') {
            try {
              await buttonInteraction.deferUpdate();
              
              // Delete the old wallet
              await PrismaDatabase.deleteWallet(existingWallet.public_key);
              
              // Create new wallet
              const walletService = new WalletService();
              const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
              const newWallet = await walletService.createOrGetWallet(interaction.user.id, isAdmin);

              const successEmbed = EmbedBuilder.createSuccessEmbed(
                '✅ Wallet Regenerated',
                `**Your wallet has been successfully regenerated!**\n\n` +
                `**Old Wallet:** \`${existingWallet.public_key}\`\n` +
                `**New Wallet:** \`${newWallet.publicKey}\`\n\n` +
                `**Next Steps:**\n` +
                `✅ Your wallet export will now work properly\n` +
                `✅ Use \`/wallet\` to view your new wallet\n` +
                `✅ Transfer any tokens from your old wallet if needed\n\n` +
                `*Your new wallet is properly encrypted and secure*`
              );

              await interaction.editReply({ embeds: [successEmbed], components: [] });

              console.log(`🔄 Wallet regenerated for user ${interaction.user.tag}: ${existingWallet.public_key} → ${newWallet.publicKey}`);
              
            } catch (regenerateError: any) {
              console.error('Error during wallet regeneration:', regenerateError);
              
              const errorEmbed = EmbedBuilder.createErrorEmbed(
                'Regeneration Failed',
                `Failed to regenerate wallet: ${regenerateError.message}`
              );
              
              await interaction.editReply({ embeds: [errorEmbed], components: [] });
            }
          } else if (buttonInteraction.customId === 'cancel_regenerate') {
            await buttonInteraction.deferUpdate();
            
            const cancelEmbed = EmbedBuilder.createInfoEmbed(
              'Regeneration Cancelled',
              'Wallet regeneration cancelled. Your wallet remains unchanged.'
            );
            
            await interaction.editReply({ embeds: [cancelEmbed], components: [] });
          }
        });

        collector.on('end', async (collected) => {
          if (collected.size === 0) {
            const timeoutEmbed = EmbedBuilder.createInfoEmbed(
              'Regeneration Cancelled',
              'Wallet regeneration cancelled due to timeout. Your wallet remains unchanged.'
            );
            try {
              await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            } catch (editError) {
              console.warn('Failed to edit reply after timeout:', editError);
            }
          }
        });
        
      } catch (collectorError) {
        console.error('Error setting up button collector:', collectorError);
        
        const fallbackEmbed = EmbedBuilder.createErrorEmbed(
          'Confirmation Error',
          'Unable to set up confirmation. Please try the command again.'
        );
        
        await interaction.editReply({ embeds: [fallbackEmbed], components: [] });
      }

    } catch (error: any) {
      console.error('Error regenerating wallet:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Regeneration Failed',
        `Failed to regenerate wallet: ${error.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default regenerateWalletCommand;
