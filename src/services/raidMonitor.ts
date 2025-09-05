/**
 * Spotify Raid Monitor
 * Monitors user listening activity for Spotify platform
 */

import { Client, User as DiscordUser, EmbedBuilder as DiscordEmbedBuilder } from 'discord.js';
import PrismaDatabase from '../database/prisma';
import SpotifyApiService from './spotify/SpotifyApiService';
import SpotifyAuthService from './spotify/SpotifyAuthService';
import SpotifyTrackingService from './spotify/SpotifyTrackingService';
import config from '../config/environment';
import { Platform } from '../types/spotify';

class RaidMonitor {
  private client: Client;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private dmInterval: NodeJS.Timeout | null = null;
  private lastProgressUpdate: number = 0;
  
  // Spotify services
  private spotifyAuthService: SpotifyAuthService;
  private spotifyApiService: SpotifyApiService;
  private spotifyTrackingService: SpotifyTrackingService;

  constructor(client: Client) {
    this.client = client;
    
    // Initialize Spotify services
    this.spotifyAuthService = new SpotifyAuthService({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: config.spotify.redirectUri
    });
    
    this.spotifyApiService = new SpotifyApiService(this.spotifyAuthService, {
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret
    });
    this.spotifyTrackingService = new SpotifyTrackingService(
      this.spotifyApiService, 
      this.spotifyAuthService,
      this.client
    );
  }

  /**
   * Start monitoring raid participants
   */
  start(): void {
    console.log('🎯 Starting Spotify raid monitor...');

    // Main monitoring loop - check all participants every 10 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllParticipants();
    }, 10000);

    // Cleanup inactive participants every 2 minutes
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupInactiveParticipants();
    }, 120000);

    // Send progress DMs every 2 seconds for real-time updates
    this.dmInterval = setInterval(async () => {
      await this.sendProgressDMs();
    }, 2000);

    // Start Spotify-specific tracking
    this.spotifyTrackingService.startGlobalTracking();

    console.log('✅ Spotify raid monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    console.log('🛑 Stopping Spotify raid monitor...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.dmInterval) {
      clearInterval(this.dmInterval);
      this.dmInterval = null;
    }

    this.spotifyTrackingService.stopGlobalTracking();

    console.log('✅ Spotify raid monitor stopped');
  }

  /**
   * Check all active raid participants
   */
  private async checkAllParticipants(): Promise<void> {
    try {
      const participants = await PrismaDatabase.getAllActiveParticipants();
      
      for (const participant of participants) {
        await this.checkParticipant(participant);
      }

      // Check for raid completions
      await this.checkRaidCompletions();
      
      // Update raid progress embeds (every 30 seconds to avoid spam)
      if (this.lastProgressUpdate + 30000 < Date.now()) {
        await this.updateRaidProgressEmbeds();
        this.lastProgressUpdate = Date.now();
      }
      
    } catch (error) {
      console.error('Error in participant monitoring:', error);
    }
  }

  /**
   * Check individual participant
   */
  private async checkParticipant(participant: any): Promise<void> {
    try {
      const raid = participant.raid;
      if (!raid) return;

      const platform = raid.platform as Platform;
      const requiredTime = raid.required_listen_time || 30;

      await this.checkSpotifyParticipant(participant, raid, requiredTime);

    } catch (error) {
      console.error(`Error checking participant ${participant.discord_id}:`, error);
    }
  }

  /**
   * Check Spotify participant listening status
   */
  private async checkSpotifyParticipant(participant: any, raid: any, requiredTime: number): Promise<void> {
    try {
      // Check if user is authenticated with Spotify
      const hasAuth = await this.spotifyAuthService.isUserAuthenticated(participant.discord_id);
      if (!hasAuth) {
        console.warn(`User ${participant.discord_id} lost Spotify authentication`);
        return;
      }

      // Check if user is currently playing the raid track
      const playbackStatus = await this.spotifyApiService.isPlayingTrack(
        participant.discord_id, 
        raid.track_id
      );

      const now = new Date();
      const timeSinceLastCheck = participant.last_check 
        ? (now.getTime() - new Date(participant.last_check).getTime()) / 1000 
        : 3; // Default to 3 seconds if no last check

      let newListenTime = participant.total_listen_duration;
      const wasListening = participant.is_listening;

      if (playbackStatus.isPlaying) {
        // User is actively listening - add time since last check
        newListenTime += timeSinceLastCheck;
        
        // Update database
        await PrismaDatabase.updateRaidParticipant(raid.id, participant.discord_id, {
          is_listening: true,
          total_listen_duration: Math.floor(newListenTime),
          last_check: now,
          qualified: newListenTime >= requiredTime,
          ...(newListenTime >= requiredTime && !participant.qualified && {
            qualified_at: now
          })
        });

        console.log(`🎶 ${participant.user.spotify_display_name || 'User'} listening to Spotify (${Math.floor(newListenTime)}s/${requiredTime}s)`);
      } else {
        // User stopped listening - reset timer
        if (wasListening) {
          console.log(`⏸️ ${participant.user.spotify_display_name || 'User'} stopped Spotify playback - resetting timer`);
          newListenTime = 0; // Reset timer when user stops
        }

        await PrismaDatabase.updateRaidParticipant(raid.id, participant.discord_id, {
          is_listening: false,
          total_listen_duration: Math.floor(newListenTime),
          last_check: now
        });
      }

    } catch (error: any) {
      console.error(`Error checking Spotify participant ${participant.discord_id}:`, error.message);
    }
  }


  /**
   * Check for raid completions
   */
  private async checkRaidCompletions(): Promise<void> {
    try {
      const activeRaids = await PrismaDatabase.getActiveRaids();
      
      for (const raid of activeRaids) {
        const qualifiedCount = await PrismaDatabase.getQualifiedParticipantCount(raid.id);
        
        if (qualifiedCount >= raid.streams_goal) {
          await PrismaDatabase.completeRaid(raid.id);
          await this.announceRaidCompletion(raid);
          
          console.log(`🏆 Raid ${raid.id} completed with ${qualifiedCount} qualified participants`);
        }
      }
    } catch (error) {
      console.error('Error checking raid completions:', error);
    }
  }

  /**
   * Announce raid completion in Discord with enhanced formatting
   */
  private async announceRaidCompletion(raid: any): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(raid.guild_id);
      if (!guild) return;

      const channel = guild.channels.cache.get(raid.channel_id);
      if (!channel || !channel.isTextBased()) return;

      const winners = await PrismaDatabase.getRaidWinners(raid.id, 10);
      const platformIcon = raid.platform === 'SPOTIFY' ? '🎶' : '🎵';
      const isCryptoRaid = raid.token_mint && raid.token_mint !== 'SOL';
      
      // Enhanced track metadata (Spotify only)
      let enhancedTrackData: any = null;
      
      // Build Spotify track URL
      const trackUrl = `https://open.spotify.com/track/${raid.track_id}`;

      const artistDisplay = enhancedTrackData?.verified ? 
        `✅ ${raid.track_artist}` : 
        raid.track_artist;

      const embed = {
        title: `${platformIcon} 🏆 RAID VICTORY!`,
        description: 
          `## 🎵 **[${raid.track_title}](${trackUrl})**\n` +
          `🎤 **by ${artistDisplay}**\n` +
          (enhancedTrackData?.genre ? `🎨 **Genre:** ${enhancedTrackData.genre}\n` : '') +
          (enhancedTrackData?.duration ? `⏱️ **Duration:** ${enhancedTrackData.duration}\n` : '') +
          (enhancedTrackData?.playCount ? `🔥 **Total Plays:** ${enhancedTrackData.playCount.toLocaleString()}\n` : '') +
          `\n🎯 **Mission Accomplished!** ${raid.streams_goal} listeners completed the raid!\n\n` +
          `💰 **Reward Distribution:** ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens per winner\n` +
          `⏱️ **Required Listen Time:** ${raid.required_listen_time} seconds\n` +
          `🏆 **Platform:** ${raid.platform}${raid.premium_only ? ' (Premium)' : ''}\n\n` +
          `**🏅 Top Winners:**\n` +
          winners.slice(0, 5).map((w: any, i: number) => {
            const displayName = w.user.discord_username || 'Unknown User';
            const medals = ['🥇', '🥈', '🥉', '🏅', '🏅'];
            return `${medals[i] || '🏅'} **${i + 1}.** ${displayName}`;
          }).join('\n') + 
          (winners.length > 5 ? `\n*...and ${winners.length - 5} more winners!*` : '') +
          `\n\n**🚀 Click "Claim Reward" below to get your tokens!**`,
        color: isCryptoRaid ? 0xFFD700 : (raid.platform === 'SPOTIFY' ? 0x1DB954 : 0x8B5DFF),
        image: { url: 'https://cdn.discordapp.com/attachments/1397288085779251272/1412025706258632765/raidcompleted_3_2.gif' }, // Victory celebration GIF
        thumbnail: enhancedTrackData?.artwork ? { url: enhancedTrackData.artwork } : 
               (raid.track_artwork_url ? { url: raid.track_artwork_url } : undefined),
        timestamp: new Date().toISOString(),
        footer: {
          text: `Raid ID: ${raid.id} | Completed at`,
          icon_url: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/spotify.svg'
        }
      };

      await channel.send({ 
        embeds: [embed],
        components: [{
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            style: 3, // Success style
            label: '💎 Claim Your Tokens',
            custom_id: `claim_reward_${raid.id}`,
            emoji: { name: '💰' }
          }]
        }]
      });

      console.log(`🎉 Announced raid completion for raid ${raid.id}: ${raid.track_title}`);

    } catch (error) {
      console.error('Error announcing enhanced raid completion:', error);
    }
  }

  /**
   * Send progress DMs to active participants
   */
  private async sendProgressDMs(): Promise<void> {
    try {
      const activeListeners = await PrismaDatabase.getActiveListeners();
      const now = new Date();
      
      for (const participant of activeListeners) {
        try {
          // Check if we sent a DM recently (limit to once per 2 seconds for real-time updates)
          if (participant.last_dm_sent) {
            const timeSinceLastDM = now.getTime() - new Date(participant.last_dm_sent).getTime();
            if (timeSinceLastDM < 2000) { // Less than 2 seconds
              continue;
            }
          }

          const discordUser = await this.client.users.fetch(participant.discord_id);
          const raid = participant.raid;
          
          if (raid.platform === 'SPOTIFY') {
            const session = this.spotifyTrackingService.getSession(participant.discord_id, raid.id);
            if (session) {
              await this.spotifyTrackingService.sendProgressDM(discordUser, raid, session);
            }
          }

          // Update last DM sent time
          await PrismaDatabase.updateRaidParticipant(raid.id, participant.discord_id, {
            last_dm_sent: now
          });

        } catch (dmError) {
          console.error(`Failed to send progress DM to ${participant.discord_id}:`, dmError);
        }
      }
    } catch (error) {
      console.error('Error sending progress DMs:', error);
    }
  }

  /**
   * Clean up inactive participants
   */
  private async cleanupInactiveParticipants(): Promise<void> {
    try {
      // Remove participants who joined but never started listening after 60 seconds
      const inactiveParticipants = await PrismaDatabase.getParticipantsWhoStoppedListening();
      
      for (const participant of inactiveParticipants) {
        await PrismaDatabase.deleteRaidParticipant(participant.id);
        console.log(`🧹 Removed inactive participant: ${participant.discord_id}`);
      }

      // Clean up Spotify tracking sessions (OAuth sessions cleaned up by OAuth server)
      this.spotifyTrackingService.cleanupInactiveSessions();
      
    } catch (error) {
      console.error('Error cleaning up inactive participants:', error);
    }
  }

  /**
   * Start tracking a participant for a raid
   */
  async startTrackingParticipant(
    discordId: string, 
    raidId: number, 
    platform: Platform, 
    trackId: string,
    requiredTime: number
  ): Promise<void> {
    if (platform === 'SPOTIFY') {
      await this.spotifyTrackingService.startTracking(discordId, raidId, trackId, requiredTime);
    }
    
    console.log(`🎯 Started tracking ${platform} participant ${discordId} for raid ${raidId}`);
  }

  /**
   * Stop tracking a participant
   */
  async stopTrackingParticipant(discordId: string, raidId: number, platform: Platform): Promise<void> {
    if (platform === 'SPOTIFY') {
      this.spotifyTrackingService.stopTracking(discordId, raidId);
    }
    
    console.log(`⏹️ Stopped tracking ${platform} participant ${discordId} for raid ${raidId}`);
  }

  /**
   * Handle new participant joining a raid
   */
  async addParticipant(
    discordId: string, 
    raidId: number, 
    platformUserId?: string
  ): Promise<void> {
    try {
      // Add participant to database
      await PrismaDatabase.addRaidParticipant(raidId, discordId, platformUserId);
      
      // Get raid info to determine platform
      const raid = await PrismaDatabase.getRaid(raidId);
      if (!raid) {
        throw new Error('Raid not found');
      }

      // Start platform-specific tracking
      await this.startTrackingParticipant(
        discordId, 
        raidId, 
        raid.platform as Platform, 
        raid.track_id,
        raid.required_listen_time
      );

      // Send initial progress DM after a delay to allow user to start playing
      setTimeout(async () => {
        try {
          const discordUser = await this.client.users.fetch(discordId);
          if (raid.platform === 'SPOTIFY') {
            const session = this.spotifyTrackingService.getSession(discordId, raidId);
            if (session) {
              await this.spotifyTrackingService.sendProgressDM(discordUser, raid, session);
            }
          }
        } catch (dmError) {
          console.warn(`Failed to send initial progress DM to ${discordId}:`, dmError);
        }
      }, 5000); // 5 second delay

      console.log(`➕ Added ${raid.platform} participant ${discordId} to raid ${raidId}`);
    } catch (error) {
      console.error(`Error adding participant ${discordId} to raid ${raidId}:`, error);
    }
  }

  /**
   * Send initial progress DM to participant
   */
  private async sendInitialProgressDM(discordUser: any, raid: any): Promise<void> {
    try {
      const platformIcon = raid.platform === 'SPOTIFY' ? '🎶' : '🎵';
      const platformName = 'Spotify';
      
      const embed = {
        title: `${platformIcon} Raid Progress Tracker`,
        description: `🎯 **You've joined the raid!**\n\n` +
          `🎵 **Track:** ${raid.track_title}\n` +
          `🎤 **Artist:** ${raid.track_artist}\n` +
          `🎧 **Platform:** ${platformName}${raid.premium_only ? ' (Premium)' : ''}\n\n` +
          `⏰ **Listen for ${raid.required_listen_time} seconds to qualify**\n` +
          `💰 **Reward:** ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens\n\n` +
          `🎧 **Start playing the track now!**\n` +
          `I'll update your progress every few seconds.`,
        color: raid.platform === 'SPOTIFY' ? 0x1DB954 : 0x8B5DFF,
        fields: [
          {
            name: '📊 Progress',
            value: `⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%\n**0**/${raid.required_listen_time} seconds`,
            inline: false
          },
          {
            name: '🎯 Status',
            value: '⏳ **Waiting for playback to start...**',
            inline: true
          },
          {
            name: '💰 Reward',
            value: `**${raid.reward_amount}** ${raid.token_mint || 'SOL'} tokens`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Raid ID: ${raid.id} | 🔄 Updates every 2 seconds`
        }
      };

      const discordEmbed = new DiscordEmbedBuilder(embed);
      
      if (raid.track_artwork_url) {
        discordEmbed.setThumbnail(raid.track_artwork_url);
      }

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [discordEmbed] });
      
      console.log(`📬 Sent initial progress DM to ${discordUser.tag} for raid ${raid.id}`);
    } catch (error) {
      console.error('Failed to send initial progress DM:', error);
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats(): {
    totalActiveParticipants: number;
    spotifyStats: any;
    activeRaids: number;
  } {
    return {
      totalActiveParticipants: 0, // Will be populated from database
      spotifyStats: this.spotifyTrackingService.getSessionStats(),
      activeRaids: 0 // Will be populated from database
    };
  }

  /**
   * Check if user can participate in a premium-only raid
   */
  async canParticipateInPremiumRaid(discordId: string, raidId: number): Promise<{
    canParticipate: boolean;
    reason?: string;
  }> {
    try {
      const raid = await PrismaDatabase.getRaid(raidId);
      if (!raid) {
        return { canParticipate: false, reason: 'Raid not found' };
      }

      // If it's not a premium-only Spotify raid, everyone can participate
      if (raid.platform !== 'SPOTIFY' || !raid.premium_only) {
        return { canParticipate: true };
      }

      // Check if user has Spotify Premium
      const isPremium = await this.spotifyAuthService.isUserPremium(discordId);
      
      if (!isPremium) {
        return { 
          canParticipate: false, 
          reason: 'This raid requires Spotify Premium subscription' 
        };
      }

      return { canParticipate: true };
    } catch (error) {
      console.error(`Error checking premium raid eligibility for ${discordId}:`, error);
      return { canParticipate: false, reason: 'Error checking eligibility' };
    }
  }

  /**
   * Update raid progress embeds in Discord channels
   */
  private async updateRaidProgressEmbeds(): Promise<void> {
    try {
      const activeRaids = await PrismaDatabase.getActiveRaids();
      
      for (const raid of activeRaids) {
        try {
          if (!raid.message_id || !raid.channel_id) continue;
          
          // Get qualified participant count (not total joiners)
          const qualifiedCount = await PrismaDatabase.getQualifiedParticipantCount(raid.id);
          
          // Update raid current_streams in database with qualified count
          await PrismaDatabase.updateRaid(raid.id, { current_streams: qualifiedCount });
          
          // Get the Discord channel and message
          const channel = await this.client.channels.fetch(raid.channel_id);
          if (!channel || !channel.isTextBased()) continue;
          
          const message = await channel.messages.fetch(raid.message_id);
          if (!message) continue;
          
          // Reconstruct track data for embed
          const trackData = {
            id: raid.track_id,
            title: raid.track_title || 'Unknown Track',
            user: {
              name: raid.track_artist || 'Unknown Artist',
              handle: (raid.track_artist || 'unknown').toLowerCase().replace(/\s+/g, ''),
              verified: false
            },
            genre: 'Spotify Track',
            duration: raid.track_duration_ms ? Math.floor(raid.track_duration_ms / 1000) : undefined,
            permalink: raid.track_url,
            artwork: raid.track_artwork_url ? {
              _480x480: raid.track_artwork_url,
              _150x150: raid.track_artwork_url,
              _1000x1000: raid.track_artwork_url
            } : undefined,
            // Enhanced metadata
            album: raid.album_name || undefined,
            explicit: raid.is_explicit || false,
            isPlayable: raid.is_playable !== false,
            linkedTrackId: raid.linked_track_id || undefined
          };
          
          // Create updated raid object
          const raidWithTrack = {
            ...raid,
            current_streams: qualifiedCount,
            qualified_count: qualifiedCount,
            token_mint: raid.token_mint || 'SOL',
            reward_per_completion: raid.reward_per_completion ? parseFloat(raid.reward_per_completion) : 0
          };
          
          // Generate updated embed
          const { default: EmbedBuilder } = await import('../utils/embedBuilder');
          const updatedEmbed = EmbedBuilder.createRaidEmbed(raidWithTrack as any, trackData, true);
          
          // Update the message
          await message.edit({ embeds: [updatedEmbed] });
          
          console.log(`📊 Updated progress embed for raid ${raid.id}: ${qualifiedCount}/${raid.streams_goal} participants`);
          
        } catch (updateError) {
          console.error(`Error updating progress embed for raid ${raid.id}:`, updateError);
        }
      }
    } catch (error) {
      console.error('Error updating raid progress embeds:', error);
    }
  }

  /**
   * Get service instances for external use
   */
  getSpotifyServices() {
    return {
      auth: this.spotifyAuthService,
      api: this.spotifyApiService,
      tracking: this.spotifyTrackingService
    };
  }
}

export default RaidMonitor;
