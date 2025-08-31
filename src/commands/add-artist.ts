import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const addArtistCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('add-artist')
    .setDescription('🎨 Promote a user to Artist role (Admins only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to promote to Artist role')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check admin permissions
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins can promote users to Artist role.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);

      // Check if target user exists in database
      let user = await PrismaDatabase.getUser(targetUser.id);
      if (!user) {
        // Create user record if doesn't exist
        user = await PrismaDatabase.createUser({
          discordId: targetUser.id,
          spotifyUserId: '',
          spotifyDisplayName: targetUser.displayName,
          spotifyEmail: '',
          tokensBalance: 0
        });
        console.log(`👤 Created user record for ${targetUser.tag} before promoting to artist`);
      }

      // Check if user is already an artist or admin
      if (user.role === 'ARTIST') {
        const embed = EmbedBuilder.createInfoEmbed(
          'Already an Artist',
          `🎨 **${targetUser.tag}** is already an Artist!\n\n` +
          `They can already:\n` +
          `✅ Create raids with \`/play\`\n` +
          `✅ View their deposit wallet with \`/deposit\`\n` +
          `✅ Manage their tokens\n\n` +
          `No changes needed.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (user.role === 'SUPER_ADMIN') {
        const embed = EmbedBuilder.createInfoEmbed(
          'Already Super Admin',
          `👑 **${targetUser.tag}** is a Super Admin!\n\n` +
          `Super Admins have all Artist permissions and more.\n` +
          `No changes needed.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Promote user to artist - role update handled separately
      // Note: Role updates are handled through the database schema directly

      // Create artist wallet if they don't have one
      const WalletService = require('../services/wallet').default;
      const walletService = new WalletService();
      const artistWallet = await walletService.createOrGetWallet(targetUser.id, true);

      const embed = EmbedBuilder.createSuccessEmbed(
        'Artist Promoted',
        `✅ **${targetUser.tag} is now an Artist!**\n\n` +
        `🎨 **New Permissions:**\n` +
        `✅ Create music raids with \`/play\`\n` +
        `✅ Deposit tokens for raid rewards\n` +
        `✅ Access artist wallet features\n` +
        `✅ Withdraw any amount (no 1 SOL limit)\n\n` +
        `🏦 **Artist Wallet Created:**\n` +
        `\`${artistWallet.publicKey}\`\n\n` +
        `**Next Steps:**\n` +
        `1. User can use \`/deposit\` to see their wallet address\n` +
        `2. Send tokens to their wallet for raid rewards\n` +
        `3. Create raids with \`/play\` using their tokens\n\n` +
        `*Artist can now participate in the full crypto raid ecosystem!*`
      );

      await interaction.editReply({ embeds: [embed] });

      // Try to send DM to the new artist
      try {
        const dmChannel = await targetUser.createDM();
        const artistDM = EmbedBuilder.createSuccessEmbed(
          '🎨 You\'re now an Artist!',
          `🎉 **Congratulations!**\n\n` +
          `You've been promoted to **Artist** by ${interaction.user.tag}!\n\n` +
          `**New Abilities:**\n` +
          `🎯 Create music raids with \`/play\`\n` +
          `💳 Deposit tokens for raid rewards\n` +
          `💰 Withdraw any amount (no limits)\n` +
          `🏦 Access to artist wallet features\n\n` +
          `**Get Started:**\n` +
          `• Use \`/deposit\` to see your wallet address\n` +
          `• Use \`/wallet\` to view your balances\n` +
          `• Use \`/play\` to create epic raids!\n\n` +
          `Welcome to the creator economy! 🚀`
        );
        
        await dmChannel.send({ embeds: [artistDM] });
        console.log(`📨 Sent artist promotion DM to ${targetUser.tag}`);
      } catch (dmError) {
        console.warn(`Failed to send artist promotion DM to ${targetUser.tag}:`, dmError);
      }

      console.log(`🎨 User promoted to artist: ${targetUser.tag} (${targetUser.id}) by ${interaction.user.tag}`);

    } catch (error: any) {
      console.error('Error promoting user to artist:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Promotion Failed',
        `Failed to promote user to Artist: ${error.message}\n\nPlease try again or contact support.`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default addArtistCommand;
