import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder as DiscordEmbedBuilder,
  ChannelType 
} from 'discord.js';
import PrismaDatabase from '../database/prisma';
import EmbedBuilder from '../utils/embedBuilder';
import SpotifyApiService from '../services/spotify/SpotifyApiService';
import SpotifyAuthService from '../services/spotify/SpotifyAuthService';
import SpotifyMetadataService from '../services/spotify/SpotifyMetadataService';
import WalletService from '../services/wallet';
import config from '../config/environment';
import { Command } from '../types';

const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎯 Create a Spotify music raid campaign with crypto rewards')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('Spotify track URL')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('goal')
        .setDescription('Number of participants needed (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addIntegerOption(option =>
      option.setName('reward')
        .setDescription('Token reward amount per participant')
        .setRequired(true)
        .setMinValue(1)
    )
    .addIntegerOption(option =>
      option.setName('time')
        .setDescription('Required listening time in seconds (15-300)')
        .setRequired(true)
        .setMinValue(15)
        .setMaxValue(300)
    )
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Raid duration in minutes (5-180)')
        .setRequired(true)
        .setMinValue(5)
        .setMaxValue(180)
    )
    .addBooleanOption(option =>
      option.setName('premium')
        .setDescription('Require Spotify Premium (enables enhanced tracking)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token mint address (default: SOL)')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post the raid (default: current channel)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();

      // Check admin permissions
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      if (!isAdmin) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only administrators can create raids.\n\nContact a server admin to create raids.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get parameters
      const trackUrl = interaction.options.getString('url', true);
      const goal = interaction.options.getInteger('goal', true);
      const reward = interaction.options.getInteger('reward', true);
      const requiredTime = interaction.options.getInteger('time', true);
      const duration = interaction.options.getInteger('duration', true);
      const premiumOnly = interaction.options.getBoolean('premium') || false;
      const tokenMint = interaction.options.getString('token') || 'SOL';
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

      // Validate channel
      if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Channel',
          'Please select a valid text channel for the raid.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Validate Spotify track URL and get track info
      if (!trackUrl.includes('open.spotify.com/track/')) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid URL',
          'Please provide a valid Spotify track URL.\n\n' +
          '**Supported format:**\n' +
          '• `https://open.spotify.com/track/...`'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      let trackInfo: any;
      try {
        const spotifyAuthService = new SpotifyAuthService({
          clientId: config.spotify.clientId!,
          clientSecret: config.spotify.clientSecret!,
          redirectUri: config.spotify.redirectUri!
        });
        
        const spotifyApiService = new SpotifyApiService(spotifyAuthService);
        trackInfo = await spotifyApiService.getTrackFromUrl(trackUrl);
      } catch (error: any) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Spotify Track',
          `Failed to fetch track information: ${error.message}\n\nPlease check the URL and try again.`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get enhanced Spotify track metadata
      let enhancedMetadata: any = {};
      try {
        const spotifyAuthService = new SpotifyAuthService({
          clientId: config.spotify.clientId!,
          clientSecret: config.spotify.clientSecret!,
          redirectUri: config.spotify.redirectUri!
        });
        
        const spotifyMetadataService = new SpotifyMetadataService(spotifyAuthService, {
          clientId: config.spotify.clientId!,
          clientSecret: config.spotify.clientSecret!,
          redirectUri: config.spotify.redirectUri!
        });

        const metadata = await spotifyMetadataService.getEnhancedTrackMetadata(
          trackInfo.id, 
          interaction.user.id
        );

        enhancedMetadata = {
          title: metadata.track.name,
          artist: metadata.artistNames,
          artwork: metadata.albumArtwork.large || metadata.albumArtwork.medium,
          genre: 'Spotify Track',
          verified: true,
          duration: metadata.formattedDuration,
          album: metadata.albumInfo.name,
          releaseDate: metadata.albumInfo.releaseDate,
          explicit: metadata.track.explicit,
          isPlayable: metadata.isPlayable,
          linkedTrackId: metadata.linkedTrackId,
          spotifyUrl: metadata.track.external_urls.spotify,
          fullMetadata: metadata
        };

        console.log(`📊 Enhanced Spotify metadata loaded for ${trackInfo.id}`);
      } catch (error) {
        console.warn('Failed to get enhanced Spotify metadata, using basic info:', error);
        enhancedMetadata = {
          title: trackInfo.title,
          artist: trackInfo.artist,
          artwork: trackInfo.artwork_url,
          genre: 'Spotify Track',
          verified: false
        };
      }

      // Create the raid in database with enhanced metadata
      const raid = await PrismaDatabase.createRaid({
        trackId: trackInfo.id,
        trackUrl: trackUrl,
        trackTitle: enhancedMetadata.title || trackInfo.title,
        trackArtist: enhancedMetadata.artist || trackInfo.artist,
        trackArtworkUrl: enhancedMetadata.artwork || trackInfo.artwork_url,
        platform: 'SPOTIFY',
        premiumOnly,
        requiredListenTime: requiredTime,
        streamsGoal: goal,
        rewardAmount: reward,
        rewardTokenMint: tokenMint,
        channelId: targetChannel.id,
        guildId: interaction.guild!.id,
        creatorId: interaction.user.id,
        durationMinutes: duration,
        // Enhanced metadata
        metadataJson: enhancedMetadata.fullMetadata ? JSON.stringify(enhancedMetadata.fullMetadata) : undefined,
        linkedTrackId: enhancedMetadata.linkedTrackId,
        isPlayable: enhancedMetadata.isPlayable,
        trackDurationMs: enhancedMetadata.fullMetadata?.track?.duration_ms,
        isExplicit: enhancedMetadata.explicit,
        albumName: enhancedMetadata.album
      });

      // Create raid embed
      const raidWithTrack = {
        ...raid,
        current_streams: 0,
        streams_goal: goal,
        platform: 'SPOTIFY',
        reward_amount: reward,
        required_listen_time: requiredTime,
        duration_minutes: duration,
        premium_only: premiumOnly,
        token_mint: tokenMint,
        reward_per_completion: raid.reward_per_completion ? parseFloat(raid.reward_per_completion) : 0,
        track_title: trackInfo.title,
        track_artist: trackInfo.artist,
        track_artwork_url: trackInfo.artwork_url,
        status: 'ACTIVE' as const,
        created_at: new Date()
      };

      const trackData = {
        id: trackInfo.id,
        title: enhancedMetadata.title || trackInfo.title,
        user: {
          name: enhancedMetadata.artist || trackInfo.artist,
          handle: (enhancedMetadata.artist || trackInfo.artist).toLowerCase().replace(/\s+/g, ''),
          verified: enhancedMetadata.verified || false
        },
        genre: enhancedMetadata.genre || trackInfo.genre || 'Spotify Track',
        duration: enhancedMetadata.duration || trackInfo.duration,
        playCount: enhancedMetadata.playCount || trackInfo.playCount || 0,
        permalink: enhancedMetadata.spotifyUrl || trackInfo.permalink,
        artwork: trackInfo.artwork ? {
          _480x480: enhancedMetadata.artwork || trackInfo.artwork_url,
          _150x150: enhancedMetadata.artwork || trackInfo.artwork_url,
          _1000x1000: enhancedMetadata.artwork || trackInfo.artwork_url
        } : undefined,
        // Enhanced metadata
        album: enhancedMetadata.album,
        releaseDate: enhancedMetadata.releaseDate,
        explicit: enhancedMetadata.explicit,
        isPlayable: enhancedMetadata.isPlayable,
        linkedTrackId: enhancedMetadata.linkedTrackId
      };

      const raidEmbed = EmbedBuilder.createRaidEmbed(raidWithTrack as any, trackData, true);

      // Create buttons
      const joinButton = new ButtonBuilder()
        .setCustomId(`join_raid_${raid.id}`)
        .setLabel('🎯 Join Raid')
        .setStyle(ButtonStyle.Success);

      const spotifyButton = new ButtonBuilder()
        .setLabel('Open in Spotify')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://open.spotify.com/track/${trackInfo.id}`)
        .setEmoji('🎶');

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, spotifyButton);

      // Post raid message
      const raidMessage = await (targetChannel as any).send({
        embeds: [raidEmbed],
        components: [buttonRow]
      });

      // Update raid with message ID
      await PrismaDatabase.updateRaid(raid.id, { message_id: raidMessage.id });

      // Success response
      const embed = EmbedBuilder.createSuccessEmbed(
        'Spotify Raid Created!',
        `🎯 **Raid posted in ${targetChannel}**\n\n` +
        `🎶 **Track:** ${trackInfo.title}\n` +
        `🎤 **Artist:** ${trackInfo.artist}\n` +
        `🎯 **Goal:** ${goal} participants\n` +
        `💰 **Reward:** ${reward} ${tokenMint} tokens each\n` +
        `⏰ **Duration:** ${duration} minutes\n` +
        `🎧 **Listen Time:** ${requiredTime} seconds\n` +
        `👑 **Premium Only:** ${premiumOnly ? 'Yes' : 'No'}\n\n` +
        `Participants can join by clicking the **Join Raid** button!`
      );

      await interaction.editReply({ embeds: [embed] });
      
      console.log(`🎯 Spotify raid created by ${interaction.user.tag}: ${trackInfo.title} (${goal} participants, ${reward} tokens)`);

    } catch (error) {
      console.error('Error creating raid:', error);
      
      const embed = EmbedBuilder.createErrorEmbed(
        'Raid Creation Failed',
        'There was an error creating the raid. Please try again.'
      );
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
};

export default playCommand;