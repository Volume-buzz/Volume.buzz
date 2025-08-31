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
import { Command } from '../types';

const logoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('logout')
    .setDescription('🚪 Disconnect your Spotify account'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Account Not Found',
          'You don\'t have any connected accounts to disconnect.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const hasSpotify = user.spotify_user_id !== null;

      if (!hasSpotify) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Account Connected',
          'You don\'t have a Spotify account connected.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Show confirmation for Spotify logout
      let description = '**🔗 Connected Account:**\n\n';
      description += `✅ **Spotify** - Connected as ${user.spotify_display_name} ${user.spotify_is_premium ? '👑' : '🆓'}\n\n`;
      description += '**⚠️ Warning:** Disconnecting will:\n' +
        '• Remove access to all raids\n' +
        '• Stop progress tracking\n' +
        '• Keep your token balance and raid history\n\n' +
        '*Are you sure you want to disconnect?*';

      const embed = new DiscordEmbedBuilder()
        .setTitle('🚪 Disconnect Spotify Account')
        .setDescription(description)
        .setColor(0xFF6B6B)
        .setTimestamp();

      // Create confirmation buttons
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('logout_spotify')
            .setLabel('🚪 Yes, Disconnect')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('quick_account')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.editReply({ 
        embeds: [embed],
        components: [buttons]
      });

    } catch (error) {
      console.error('Error in logout command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error processing your logout request. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default logoutCommand;