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
    .setDescription('🔐 Connect your Audius account to participate in raids'),

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

      // Check if user already has Audius connected
      const user = await PrismaDatabase.getUser(interaction.user.id);
      const hasAudius = user?.audius_user_id !== null && user?.audius_user_id !== '' && user?.audius_user_id !== undefined;

      if (hasAudius) {
        const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
        
        const embed = EmbedBuilder.createInfoEmbed(
          'Already Connected',
          `🎧 **Audius:** ${user?.audius_name || user?.audius_handle || 'Connected'} ${user?.audius_verified ? '✅' : ''}\n` +
          `👤 **Role:** ${isAdmin ? '👑 Super Admin' : user?.role === 'ARTIST' ? '🎨 Artist' : '👤 Fan'}\n` +
          `💰 **Tokens:** ${user?.tokens_balance || 0}\n` +
          `🏆 **Parties:** ${user?.total_parties_participated || 0}\n\n` +
          `Your Audius account is already connected!`
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
              .setCustomId('logout_audius')
              .setLabel('🚪 Disconnect')
              .setStyle(ButtonStyle.Danger)
          );

        await interaction.editReply({ 
          embeds: [embed],
          components: [buttons]
        });
        return;
      }

      // Show Audius login button
      const loginButton = new ButtonBuilder()
        .setCustomId('login_audius')
        .setLabel('🎧 Connect Audius')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(loginButton);

      const description = '🎧 **Connect your Audius account to start raiding:**\n\n' +
        '• Participate in Audius-powered music raids\n' +
        '• Earn crypto tokens for supporting artists\n' +
        '• Verified artists get highlighted inside Discord\n' +
        '• Fans can join raids and climb the leaderboard\n\n' +
        '**What you get:**\n' +
        '🔐 Secure OAuth directly with Audius\n' +
        '💰 Auto-created wallet for crypto rewards\n' +
        '🎯 Personalized raid recommendations\n\n' +
        '*Click the button below to get started!*';

      const embed = new DiscordEmbedBuilder()
        .setTitle('🔐 Connect Your Audius Account')
        .setDescription(description)
        .setColor(0x8B5CF6)
        .addFields(
          {
            name: '🎯 What are raids?',
            value: 'Listen to specific tracks for a set time to earn crypto token rewards!',
            inline: false
          },
          {
            name: '💡 Why connect Audius?',
            value: 'Prove your Audius identity so we can reward you for completing raids.',
            inline: false
          },
          {
            name: '🔒 Privacy & Security',
            value: 'Your tokens are encrypted and stored securely. We never receive your Audius password.',
            inline: false
          }
        )
        .setFooter({ text: 'Audius Integration • Secure OAuth Flow' })
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
