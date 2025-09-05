import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder as DiscordEmbedBuilder
} from 'discord.js';
import * as Sentry from '@sentry/node';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';
import { createUserLogger } from '../utils/logger';

const loginCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('🔐 Connect your Spotify account to participate in raids'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    return Sentry.startSpan(
      {
        op: "discord.command",
        name: "Discord Command: /login",
        attributes: {
          "discord.user_id": interaction.user.id,
          "discord.username": interaction.user.username,
          "discord.guild_id": interaction.guildId || "dm",
          "command.name": "login"
        }
      },
      async () => {
        const logger = createUserLogger('LoginCommand', {
          id: interaction.user.id,
          username: interaction.user.username
        }).withGuild({ 
          id: interaction.guildId || undefined,
          name: interaction.guild?.name 
        });
        
        try {
          logger.discordCommand('login', interaction.user, interaction.guild);
          await interaction.deferReply({ ephemeral: true });

      // Check if user already has Spotify connected
      const user = await PrismaDatabase.getUser(interaction.user.id);
      const hasSpotify = user?.spotify_user_id !== null && user?.spotify_user_id !== '' && user?.spotify_user_id !== undefined;

      if (hasSpotify) {
        const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
        
        const embed = EmbedBuilder.createInfoEmbed(
          'Already Connected',
          `🎶 **Spotify:** ${user?.spotify_display_name || 'Connected'} ${user?.spotify_is_premium ? '👑' : '🆓'}\n` +
          `👤 **Role:** ${isAdmin ? '👑 Super Admin' : user?.role === 'ARTIST' ? '🎨 Artist' : '👤 Fan'}\n` +
          `💰 **Tokens:** ${user?.tokens_balance || 0}\n` +
          `🏆 **Raids:** ${user?.total_raids_participated || 0}\n\n` +
          `Your Spotify account is already connected!`
        );

        // Add action buttons
        const buttons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('quick_account')
              .setLabel('👤 View Account')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('quick_wallet')
              .setLabel('💳 View Wallet')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('logout_spotify')
              .setLabel('🚪 Disconnect')
              .setStyle(ButtonStyle.Danger)
          );

        await interaction.editReply({ 
          embeds: [embed],
          components: [buttons]
        });
        return;
      }

      // Show Spotify login button
      const loginButton = new ButtonBuilder()
        .setCustomId('login_spotify')
        .setLabel('🎶 Connect Spotify')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(loginButton);

      const description = '🎶 **Connect your Spotify account to start raiding:**\n\n' +
        '• Participate in Spotify music raids\n' +
        '• Earn crypto tokens for listening\n' +
        '• Premium users get enhanced tracking + embedded player\n' +
        '• Free users can join most raids\n\n' +
        '**Account Types:**\n' +
        '👑 **Premium** - Full access + embedded player\n' +
        '🆓 **Free** - Basic access with API tracking\n\n' +
        '*Click the button below to get started!*';

      const embed = new DiscordEmbedBuilder()
        .setTitle('🔐 Connect Your Spotify Account')
        .setDescription(description)
        .setColor(0x1DB954)
        .addFields(
          {
            name: '🎯 What are raids?',
            value: 'Listen to specific tracks for a set time to earn crypto token rewards!',
            inline: false
          },
          {
            name: '💡 Why connect Spotify?',
            value: 'We track your listening to verify you completed the raid requirements.',
            inline: false
          },
          {
            name: '🔒 Privacy & Security',
            value: 'Your tokens are encrypted and stored securely. We only access listening data during raids.',
            inline: false
          }
        )
        .setFooter({ text: 'Spotify Discord Bot • Secure OAuth Integration' })
        .setTimestamp();

      await interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });

        } catch (error) {
          logger.error('Error in login command', error as Error, {
            command: 'login',
            channel_id: interaction.channelId
          });
          
          Sentry.captureException(error, {
            tags: {
              component: 'discord_command',
              command: 'login'
            },
            user: {
              id: interaction.user.id,
              username: interaction.user.username
            },
            extra: {
              guild_id: interaction.guildId,
              channel_id: interaction.channelId
            }
          });
          
          const embed = EmbedBuilder.createErrorEmbed(
            'Login Error',
            'There was an error processing your login request. Please try again.'
          );
          
          await interaction.editReply({ embeds: [embed] });
        }
      }
    );
  }
};

export default loginCommand;