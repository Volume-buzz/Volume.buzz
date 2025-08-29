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
import config from '../config/environment';
import { Command } from '../types';
import { Platform } from '../types/spotify';

const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎯 Create a music raid campaign with crypto rewards')
    .addStringOption(option =>
      option.setName('track')
        .setDescription('Track URL (Audius or Spotify)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('goal')
        .setDescription('Number of listeners needed to complete the raid')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addIntegerOption(option =>
      option.setName('reward')
        .setDescription('Token reward amount per participant')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Raid duration in minutes (default: 60)')
        .setRequired(false)
        .setMinValue(5)
        .setMaxValue(480)
    )
    .addIntegerOption(option =>
      option.setName('required_time')
        .setDescription('Required listening time in seconds (default: 30)')
        .setRequired(false)
        .setMinValue(10)
        .setMaxValue(300)
    )
    .addBooleanOption(option =>
      option.setName('premium')
        .setDescription('Spotify Premium required (Spotify raids only, default: false)')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post the raid (defaults to current channel)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Check if user has admin permissions or is an artist
      const user = await PrismaDatabase.getUser(interaction.user.id);
      const isAdmin = await PrismaDatabase.isAdmin(interaction.user.id);
      
      if (!isAdmin && (!user || user.role !== 'ARTIST')) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Permission Denied',
          'Only admins and verified artists can create raids.\n\nContact an admin to get artist permissions.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Get command parameters
      const trackUrl = interaction.options.getString('track', true);
      const goal = interaction.options.getInteger('goal', true);
      const reward = interaction.options.getInteger('reward', true);
      const duration = interaction.options.getInteger('duration') || 60;
      const requiredTime = interaction.options.getInteger('required_time') || 30;
      const premiumOnly = interaction.options.getBoolean('premium') || false;
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

      if (!targetChannel) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Channel',
          'Please specify a valid text channel for the raid.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Type guard for text-based channel
      if (!('send' in targetChannel)) {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid Channel Type',
          'Please select a text channel for the raid.'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Detect platform from URL
      let platform: Platform;
      let trackInfo: any;

      if (SpotifyApiService.isSpotifyUrl(trackUrl)) {
        platform = 'SPOTIFY';
        
        // Validate premium_only parameter
        if (premiumOnly) {
          console.log('🔒 Creating premium-only Spotify raid');
        }

        try {
          // Initialize Spotify services
          const spotifyAuthService = new SpotifyAuthService({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: config.spotify.redirectUri
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
      } else if (trackUrl.includes('audius.co')) {
        platform = 'AUDIUS';
        
        // Premium option not applicable for Audius
        if (premiumOnly) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Invalid Option',
            'Premium option is only available for Spotify raids. Audius raids are always free for all users.'
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        try {
          // TODO: Use existing Audius service to get track info
          // For now, parse basic info from URL
          trackInfo = {
            id: trackUrl.split('/').pop() || 'unknown',
            title: 'Audius Track', // Will be filled by actual service
            artist: 'Unknown Artist',
            url: trackUrl,
            platform: 'AUDIUS'
          };
        } catch (error: any) {
          const embed = EmbedBuilder.createErrorEmbed(
            'Invalid Audius Track',
            `Failed to fetch track information: ${error.message}\n\nPlease check the URL and try again.`
          );
          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } else {
        const embed = EmbedBuilder.createErrorEmbed(
          'Invalid URL',
          'Please provide a valid Audius or Spotify track URL.\n\n' +
          '**Supported formats:**\n' +
          '• `https://audius.co/...`\n' +
          '• `https://open.spotify.com/track/...`'
        );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create the raid in database
      const raid = await PrismaDatabase.createRaid({
        trackId: trackInfo.id,
        trackUrl: trackUrl,
        trackTitle: trackInfo.title,
        trackArtist: trackInfo.artist,
        trackArtworkUrl: trackInfo.artwork_url,
        platform,
        premiumOnly,
        requiredListenTime: requiredTime,
        streamsGoal: goal,
        rewardAmount: reward,
        rewardTokenMint: 'SOL', // Default to SOL
        channelId: targetChannel.id,
        guildId: interaction.guild!.id,
        creatorId: interaction.user.id,
        durationMinutes: duration
      });

      // Create raid embed
      const platformIcon = platform === 'SPOTIFY' ? '🎶' : '🎵';
      const platformColor = platform === 'SPOTIFY' ? 0x1DB954 : 0x8B5DFF;
      
      let raidDescription = `${platformIcon} **Platform:** ${platform}\n` +
        `🎯 **Goal:** ${goal} qualified listeners\n` +
        `💰 **Reward:** ${reward} tokens each\n` +
        `⏱️ **Required time:** ${requiredTime} seconds\n` +
        `⌛ **Duration:** ${duration} minutes\n`;

      if (platform === 'SPOTIFY' && premiumOnly) {
        raidDescription += `🔒 **Premium Only** - Spotify Premium required\n`;
      }

      raidDescription += `\n**How to participate:**\n` +
        `1. Click "Join Raid" below\n` +
        `2. Start playing the track on ${platform}\n` +
        `3. Listen for at least ${requiredTime} seconds\n` +
        `4. Claim your ${reward} tokens when the raid completes!\n\n` +
        `**Current Progress:** 0/${goal} qualified listeners`;

      const raidEmbed = new DiscordEmbedBuilder()
        .setTitle(`🎯 ${trackInfo.title}`)
        .setDescription(raidDescription)
        .setColor(platformColor)
        .addFields(
          {
            name: '🎤 Artist',
            value: trackInfo.artist,
            inline: true
          },
          {
            name: '🎵 Platform',
            value: platform + (premiumOnly ? ' (Premium)' : ''),
            inline: true
          },
          {
            name: '💰 Total Rewards',
            value: `${goal * reward} tokens`,
            inline: true
          }
        )
        .setURL(trackUrl)
        .setTimestamp()
        .setFooter({
          text: `Raid ID: ${raid.id} • Created by ${interaction.user.displayName}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      if (trackInfo.artwork_url) {
        raidEmbed.setThumbnail(trackInfo.artwork_url);
      }

      // Create join button
      const joinButton = new ButtonBuilder()
        .setCustomId(`join_raid_${raid.id}`)
        .setLabel('🎯 Join Raid')
        .setStyle(ButtonStyle.Success);

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton);

      // Post raid message in the target channel
      const raidMessage = await targetChannel.send({
        embeds: [raidEmbed],
        components: [buttonRow]
      });

      // Update raid with message ID
      await PrismaDatabase.updateRaidMessageId(raid.id, raidMessage.id);

      // Confirmation message to command user
      const confirmEmbed = EmbedBuilder.createSuccessEmbed(
        'Raid Created!',
        `✅ **${platform} raid created successfully!**\n\n` +
        `🎵 **Track:** ${trackInfo.title}\n` +
        `🎯 **Goal:** ${goal} listeners\n` +
        `💰 **Reward:** ${reward} tokens each\n` +
        `⏱️ **Required time:** ${requiredTime} seconds\n` +
        `📍 **Channel:** <#${targetChannel.id}>\n` +
        `${premiumOnly ? '🔒 **Premium only raid**\n' : ''}` +
        `\n**Raid ID:** ${raid.id}\n` +
        `**Expires:** <t:${Math.floor(raid.expires_at!.getTime() / 1000)}:R>`
      );

      await interaction.editReply({ embeds: [confirmEmbed] });

      console.log(`🎯 ${platform} raid created: ${raid.id} by ${interaction.user.tag} - ${trackInfo.title} (${goal} goal, ${reward} tokens)`);

    } catch (error: any) {
      console.error('Error creating raid:', error);
      
      const errorEmbed = EmbedBuilder.createErrorEmbed(
        'Raid Creation Failed',
        `Failed to create raid: ${error.message}\n\nPlease try again or contact support.`
      );

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};

export default playCommand;
