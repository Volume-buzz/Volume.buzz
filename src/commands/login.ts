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
import config from '../config/environment';
import { Command } from '../types';

const loginCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('🔐 Connect your music streaming accounts to participate in raids'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check if user already has accounts connected
      const user = await PrismaDatabase.getUser(interaction.user.id);
      
      const hasAudius = user?.audius_user_id !== null;
      const hasSpotify = user?.spotify_user_id !== null;

      if (hasAudius && hasSpotify) {
        const embed = EmbedBuilder.createInfoEmbed(
          'Already Connected',
          `🎵 **Audius:** @${user.audius_handle}\n` +
          `🎶 **Spotify:** ${user.spotify_display_name} ${user.spotify_is_premium ? '👑' : '🆓'}\n\n` +
          `You're already connected to both platforms! Use \`/logout\` if you want to change accounts.`
        );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create login buttons for available platforms
      const buttons = [];

      if (!hasAudius) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('login_audius')
            .setLabel('🎵 Login with Audius')
            .setStyle(ButtonStyle.Primary)
        );
      }

      if (!hasSpotify) {
        buttons.push(
          new ButtonBuilder()
            .setCustomId('login_spotify')
            .setLabel('🎶 Login with Spotify')
            .setStyle(ButtonStyle.Success)
        );
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

      let description = '**Choose a platform to connect:**\n\n';
      
      if (!hasAudius) {
        description += '🎵 **Audius** - Decentralized music platform\n' +
          '• Participate in all Audius raids\n' +
          '• Earn crypto tokens for listening\n\n';
      } else {
        description += `✅ **Audius** - Connected as @${user.audius_handle}\n\n`;
      }

      if (!hasSpotify) {
        description += '🎶 **Spotify** - World\'s largest music platform\n' +
          '• Participate in Spotify raids\n' +
          '• Premium users get enhanced tracking\n' +
          '• Free users can join most raids\n\n';
      } else {
        description += `✅ **Spotify** - Connected as ${user.spotify_display_name} ${user.spotify_is_premium ? '👑' : '🆓'}\n\n`;
      }

      description += '*You can connect to both platforms for maximum raid opportunities!*';

      const embed = new DiscordEmbedBuilder()
        .setTitle('🔐 Connect Your Music Accounts')
        .setDescription(description)
        .setColor(0x8B5DFF)
        .addFields(
          {
            name: '🎯 What are raids?',
            value: 'Listen to specific tracks for a set time to earn crypto token rewards!',
            inline: false
          },
          {
            name: '💡 Why connect accounts?',
            value: 'We track your listening to verify you completed the raid requirements.',
            inline: false
          }
        )
        .setFooter({ 
          text: 'Your data is encrypted and secure' 
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        components: [row]
      });

    } catch (error: any) {
      console.error('Error in login command:', error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Login Error',
        'There was an error setting up the login process. Please try again.'
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export default loginCommand;
