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
    .setDescription('🔍 Debug user account information (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to debug')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check if user is admin
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Access Denied',
          'This command is only available to administrators.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const user = await PrismaDatabase.getUser(targetUser.id);

      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'User Not Found',
          `No database record found for ${targetUser.displayName} (${targetUser.id})`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Build debug information
      let description = `**🔍 Debug Info for ${targetUser.displayName}**\n\n`;
      description += `**Discord ID:** ${user.discord_id}\n`;
      description += `**Database ID:** ${user.id}\n\n`;
      
      description += `**🎶 Spotify Account:**\n`;
      description += `🎶 **Spotify ID:** ${user.spotify_user_id || 'None'}\n`;
      description += `🎶 **Display Name:** ${user.spotify_display_name || 'None'}\n`;
      description += `🎶 **Email:** ${user.spotify_email || 'None'}\n`;
      description += `🎶 **Premium:** ${user.spotify_is_premium ? '👑 Yes' : '🆓 No'}\n`;
      description += `🎶 **Country:** ${user.spotify_country || 'Unknown'}\n`;
      description += `🎶 **Product:** ${user.spotify_product || 'Unknown'}\n\n`;

      // Check connection status
      const hasSpotify = user.spotify_user_id !== null && user.spotify_user_id !== '' && user.spotify_user_id !== undefined;
      
      description += `**Connection Status:**\n`;
      description += `🎶 Spotify: ${hasSpotify ? '✅ Connected' : '❌ Not connected'}\n\n`;

      description += `**Token Info:**\n`;
      description += `💰 **Balance:** ${user.tokens_balance} tokens\n`;
      description += `🎯 **Raids Participated:** ${user.total_raids_participated}\n`;
      description += `🏆 **Rewards Claimed:** ${user.total_rewards_claimed}\n`;
      description += `👤 **Role:** ${user.role}\n\n`;

      description += `**Timestamps:**\n`;
      description += `📅 **Created:** ${user.createdAt.toLocaleString()}\n`;
      description += `🔄 **Last Updated:** ${user.updatedAt.toLocaleString()}\n`;
      description += `🔑 **Token Expires:** ${user.spotify_token_expires_at?.toLocaleString() || 'N/A'}\n`;

      const embed = new DiscordEmbedBuilder()
        .setTitle('🔍 User Debug Information')
        .setDescription(description)
        .setColor(0x1DB954)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ 
          text: `Requested by ${interaction.user.displayName}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in debug-user command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Debug Error',
        'There was an error retrieving user debug information.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default debugUserCommand;