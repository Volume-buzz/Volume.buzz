import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  EmbedBuilder as DiscordEmbedBuilder 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';

const debugUserCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('debug-user')
    .setDescription('🔍 Debug user data (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check (optional, defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Admin only
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins can use debug commands.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const user = await PrismaDatabase.getUser(targetUser.id);
      const wallet = await PrismaDatabase.getUserWallet(targetUser.id);

      let description = `**Discord:** ${targetUser.tag} (${targetUser.id})\n\n`;

      if (!user) {
        description += `❌ **No user record found**\n\nUser needs to use /login first.`;
      } else {
        description += `**Database Record:**\n`;
        description += `👤 **Role:** ${user.role}\n`;
        description += `🎵 **Audius ID:** ${user.audius_user_id || 'None'}\n`;
        description += `🎵 **Audius Handle:** @${user.audius_handle || 'None'}\n`;
        description += `🎶 **Spotify ID:** ${user.spotify_user_id || 'None'}\n`;
        description += `🎶 **Spotify Name:** ${user.spotify_display_name || 'None'}\n`;
        description += `💰 **Token Balance:** ${user.tokens_balance}\n`;
        description += `🏆 **Raids:** ${user.total_raids_participated}\n\n`;

        // Connection status
        const hasAudius = user.audius_user_id !== null && user.audius_user_id !== '' && user.audius_user_id !== undefined;
        const hasSpotify = user.spotify_user_id !== null && user.spotify_user_id !== '' && user.spotify_user_id !== undefined;
        
        description += `**Connection Status:**\n`;
        description += `🎵 **Audius:** ${hasAudius ? '✅ Connected' : '❌ Not Connected'}\n`;
        description += `🎶 **Spotify:** ${hasSpotify ? '✅ Connected' : '❌ Not Connected'}\n\n`;
      }

      if (!wallet) {
        description += `💳 **Wallet:** ❌ No wallet found`;
      } else {
        description += `💳 **Wallet:** ✅ \`${wallet.public_key}\`\n`;
        description += `🔑 **Type:** ${wallet.is_artist_wallet ? 'Admin' : 'Fan'}\n`;
        description += `📅 **Created:** ${wallet.created_at.toISOString().split('T')[0]}`;
      }

      const embed = EmbedBuilder.createInfoEmbed('🔍 User Debug Info', description);
      await interaction.editReply({ embeds: [embed] });

    } catch (error: any) {
      console.error('Error debugging user:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Debug Failed',
        `Failed to debug user: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default debugUserCommand;
