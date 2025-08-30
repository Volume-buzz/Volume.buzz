import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import AudiusService from '../services/audiusService';
import EmbedBuilder from '../utils/embedBuilder';
import { Command } from '../types';
import PrismaDatabase from '../database/prisma';

const listenCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('listen')
    .setDescription('🎵 Track your listening activity and earn rewards')
    .addStringOption(option =>
      option
        .setName('track_id')
        .setDescription('Audius track ID or URL to track listening for')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('artist_handle')
        .setDescription('Artist handle to check what they\'re currently playing')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const trackId = interaction.options.getString('track_id');
      const artistHandle = interaction.options.getString('artist_handle');
      const audiusService = new AudiusService();

      // If no parameters, show listening status
      if (!trackId && !artistHandle) {
        const activeSessions = audiusService.getActiveListeningSessions();
        const userSession = activeSessions.find(s => s.userId === interaction.user.id);

        if (userSession) {
          const track = await audiusService.getTrackInfo(userSession.trackId);
          const duration = Math.floor((Date.now() - userSession.startTime.getTime()) / 1000);
          
          const embed = EmbedBuilder.createInfoEmbed(
            '🎵 Currently Listening',
            `**Track:** ${track?.title || 'Unknown'}\n` +
            `**Duration:** ${duration} seconds\n` +
            `**Status:** ${duration >= 60 ? '✅ Eligible for rewards' : '⏳ Keep listening...'}\n\n` +
            `*Minimum listen time: 60 seconds for rewards*`
          );

          const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`stop_listening_${userSession.trackId}`)
                .setLabel('⏹️ Stop Listening')
                .setStyle(ButtonStyle.Secondary)
            );

          await interaction.editReply({ 
            embeds: [embed], 
            components: [buttons] 
          });
        } else {
          const embed = EmbedBuilder.createInfoEmbed(
            '🎵 Listening Tracker',
            `**No active listening session**\n\n` +
            `**How to use:**\n` +
            `• \`/listen track_id:D7KyD\` - Start tracking a specific track\n` +
            `• \`/listen artist_handle:skrillex\` - Check what an artist is playing\n` +
            `• \`/listen\` - Check your current listening status\n\n` +
            `**Rewards:**\n` +
            `🎵 Listen for 60+ seconds = Earn tokens!\n` +
            `⭐ Complete full tracks = Bonus rewards!`
          );

          await interaction.editReply({ embeds: [embed] });
        }
        return;
      }

      // Check what an artist is currently playing
      if (artistHandle) {
        const user = await audiusService.getUserByHandle(artistHandle);
        if (!user) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Artist Not Found',
            `❌ **Could not find artist:** \`${artistHandle}\`\n\n` +
            `Please check the handle and try again.`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const nowPlaying = await audiusService.getCurrentlyPlaying(user.userId.toString());
        
        if (nowPlaying) {
          const embed = EmbedBuilder.createSuccessEmbed(
            '🎵 Now Playing',
            `**Artist:** ${user.name} (@${user.handle})\n` +
            `**Track:** ${nowPlaying.title}\n` +
            `**Track ID:** \`${nowPlaying.id}\`\n\n` +
            `*Use \`/listen track_id:${nowPlaying.id}\` to start tracking this track*`
          );

          const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`start_listening_${nowPlaying.id}`)
                .setLabel('🎵 Start Listening')
                .setStyle(ButtonStyle.Primary)
            );

          await interaction.editReply({ 
            embeds: [embed], 
            components: [buttons] 
          });
        } else {
          const embed = EmbedBuilder.createInfoEmbed(
            '🎵 Now Playing',
            `**Artist:** ${user.name} (@${user.handle})\n` +
            `**Status:** Not currently playing any track\n\n` +
            `*Check back later or try a different artist*`
          );

          await interaction.editReply({ embeds: [embed] });
        }
        return;
      }

      // Start tracking a specific track
      if (trackId) {
        const track = await audiusService.getTrackInfo(trackId);
        if (!track) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Track Not Found',
            `❌ **Could not find track:** \`${trackId}\`\n\n` +
            `Please check the track ID and try again.`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const started = await audiusService.startListeningSession(interaction.user.id, trackId);
        
        if (started) {
          const embed = EmbedBuilder.createSuccessEmbed(
            '🎵 Listening Started',
            `**Track:** ${track.title}\n` +
            `**Artist:** ${track.artist || 'Unknown'}\n` +
            `**Started:** ${new Date().toLocaleTimeString()}\n\n` +
            `**💰 Rewards:**\n` +
            `• Listen for 60+ seconds = Earn tokens\n` +
            `• Complete the full track = Bonus rewards\n\n` +
            `*Use \`/listen\` to check your progress*`
          );

          const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`stop_listening_${trackId}`)
                .setLabel('⏹️ Stop Listening')
                .setStyle(ButtonStyle.Danger)
            );

          await interaction.editReply({ 
            embeds: [embed], 
            components: [buttons] 
          });
        } else {
          const embed = EmbedBuilder.createErrorEmbed(
            'Failed to Start Listening',
            `❌ **Could not start listening session**\n\n` +
            `This might be because:\n` +
            `• You already have an active session\n` +
            `• The track is not available\n` +
            `• Server error\n\n` +
            `Try again or contact support.`
          );
          await interaction.editReply({ embeds: [embed] });
        }
      }

    } catch (error: any) {
      console.error('Error in listen command:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Listening Error',
        `Failed to process listening request: ${error.message}`
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default listenCommand;
