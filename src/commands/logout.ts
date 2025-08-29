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
    .setDescription('🚪 Disconnect your music streaming accounts'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check current connections
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      if (!user) {
        const embed = EmbedBuilder.createErrorEmbed(
          'No Account Found',
          'You don\'t have any accounts connected to logout from.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const hasAudius = user.audius_user_id !== null;
      const hasSpotify = user.spotify_user_id !== null;

      if (!hasAudius && !hasSpotify) {
        const embed = EmbedBuilder.createInfoEmbed(
          'Not Connected',
          'You don\'t have any music accounts connected.\n\nUse `/login` to connect your accounts.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create logout options based on connected accounts
      const buttons = [];

      if (hasAudius) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('logout_audius')
            .setLabel('🎵 Logout from Audius')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (hasSpotify) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('logout_spotify')
            .setLabel('🎶 Logout from Spotify')
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (hasAudius && hasSpotify) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('logout_both')
            .setLabel('🚪 Logout from Both')
            .setStyle(ButtonStyle.Danger)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      let description = '**Current connections:**\n\n';
      
      if (hasAudius) {
        description += `✅ **Audius** - Connected as @${user.audius_handle}\n` +
          `• Raid participation: ${user.total_raids_participated}\n` +
          `• Token balance: ${user.tokens_balance}\n\n`;
      }

      if (hasSpotify) {
        description += `✅ **Spotify** - Connected as ${user.spotify_display_name}\n` +
          `• Account type: ${user.spotify_is_premium ? 'Premium 👑' : 'Free 🆓'}\n` +
          `• Email: ${user.spotify_email}\n\n`;
      }

      description += '**Choose what to disconnect:**\n\n' +
        '⚠️ **Warning:** Logging out will:\n' +
        '• Remove access to platform-specific raids\n' +
        '• Stop tracking your listening activity\n' +
        '• Keep your earned tokens and raid history';

      const embed = new DiscordEmbedBuilder()
        .setTitle('🚪 Account Logout')
        .setDescription(description)
        .setColor(0xFF6B6B)
        .addFields(
          {
            name: '💡 Selective Logout',
            value: 'You can logout from one platform while keeping the other connected.',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });

    } catch (error: any) {
      console.error('Error in logout command:', error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Logout Error',
        'There was an error processing the logout request. Please try again.'
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export default logoutCommand;
