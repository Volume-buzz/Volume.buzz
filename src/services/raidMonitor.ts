/**
 * Dual Platform Raid Monitor
 * Monitors user listening activity for both Audius and Spotify platforms
 */

import { Client, User as DiscordUser } from 'discord.js';
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
    
    this.spotifyApiService = new SpotifyApiService(this.spotifyAuthService);
    this.spotifyTrackingService = new SpotifyTrackingService(
      this.spotifyApiService, 
      this.spotifyAuthService
    );
  }

  /**
   * Start monitoring raid participants
   */
  start(): void {
    console.log('🎯 Starting dual platform raid monitor...');

    // Main monitoring loop - check all participants every 10 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllParticipants();
    }, 10000);

    // Cleanup inactive participants every 2 minutes
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupInactiveParticipants();
    }, 120000);

    // Send progress DMs every 30 seconds
    this.dmInterval = setInterval(async () => {
      await this.sendProgressDMs();
    }, 30000);

    // Start Spotify-specific tracking
    this.spotifyTrackingService.startGlobalTracking();

    console.log('✅ Dual platform raid monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    console.log('🛑 Stopping dual platform raid monitor...');

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

    console.log('✅ Dual platform raid monitor stopped');
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

      if (platform === 'SPOTIFY') {
        await this.checkSpotifyParticipant(participant, raid, requiredTime);
      } else {
        await this.checkAudiusParticipant(participant, raid, requiredTime);
      }

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

        console.log(`🎶 ${participant.user.audius_handle || 'User'} listening to Spotify (${Math.floor(newListenTime)}s/${requiredTime}s)`);
      } else {
        // User stopped listening - reset timer like Audius behavior
        if (wasListening) {
          console.log(`⏸️ ${participant.user.audius_handle || 'User'} stopped Spotify playback - resetting timer`);
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
   * Check Audius participant listening status (existing logic)
   */
  private async checkAudiusParticipant(participant: any, raid: any, requiredTime: number): Promise<void> {
    try {
      // TODO: Implement existing Audius checking logic here
      // This would be the same as your current Audius tracking implementation
      // For now, I'll create a placeholder that mimics the structure

      const now = new Date();
      const timeSinceLastCheck = participant.last_check 
        ? (now.getTime() - new Date(participant.last_check).getTime()) / 1000 
        : 10;

      // Placeholder for Audius API call to check currently playing
      // const isPlayingRaidTrack = await AudiusService.isUserPlayingTrack(participant.user.audius_user_id, raid.track_id);
      const isPlayingRaidTrack = false; // Placeholder

      let newListenTime = participant.total_listen_duration;
      const wasListening = participant.is_listening;

      if (isPlayingRaidTrack) {
        newListenTime += timeSinceLastCheck;
        
        await PrismaDatabase.updateRaidParticipant(raid.id, participant.discord_id, {
          is_listening: true,
          total_listen_duration: Math.floor(newListenTime),
          last_check: now,
          qualified: newListenTime >= requiredTime,
          ...(newListenTime >= requiredTime && !participant.qualified && {
            qualified_at: now
          })
        });

        console.log(`🎵 ${participant.user.audius_handle || 'User'} listening to Audius (${Math.floor(newListenTime)}s/${requiredTime}s)`);
      } else {
        if (wasListening) {
          console.log(`⏸️ ${participant.user.audius_handle || 'User'} stopped Audius playback - resetting timer`);
          newListenTime = 0; // Reset timer when user stops
        }

        await PrismaDatabase.updateRaidParticipant(raid.id, participant.discord_id, {
          is_listening: false,
          total_listen_duration: Math.floor(newListenTime),
          last_check: now
        });
      }

    } catch (error: any) {
      console.error(`Error checking Audius participant ${participant.discord_id}:`, error.message);
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
   * Announce raid completion in Discord
   */
  private async announceRaidCompletion(raid: any): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(raid.guild_id);
      if (!guild) return;

      const channel = guild.channels.cache.get(raid.channel_id);
      if (!channel || !channel.isTextBased()) return;

      const winners = await PrismaDatabase.getRaidWinners(raid.id, 10);
      const platformIcon = raid.platform === 'SPOTIFY' ? '🎶' : '🎵';
      
      const embed = {
        title: `${platformIcon} Raid Completed!`,
        description: `**${raid.track_title}** by ${raid.track_artist}\n\n` +
          `🎯 **Goal reached:** ${raid.streams_goal} qualified listeners\n` +
          `💰 **Rewards:** ${raid.reward_amount} tokens each\n` +
          `⏱️ **Required time:** ${raid.required_listen_time} seconds\n` +
          `🏆 **Platform:** ${raid.platform}\n\n` +
          `**Top Winners:**\n` +
          winners.slice(0, 5).map((w: any, i: number) => 
            `${i + 1}. ${w.user.audius_handle || w.user.spotify_display_name || 'Anonymous'}`
          ).join('\n') + 
          `\n\n**🎉 Click "Claim Reward" to get your tokens!**`,
        color: raid.platform === 'SPOTIFY' ? 0x1DB954 : 0x8B5DFF,
        thumbnail: raid.track_artwork_url ? { url: raid.track_artwork_url } : undefined,
        timestamp: new Date().toISOString()
      };

      await channel.send({ 
        embeds: [embed],
        components: [{
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            style: 3, // Success style
            label: '🎉 Claim Reward',
            custom_id: `claim_reward_${raid.id}`,
            emoji: { name: '🎉' }
          }]
        }]
      });

    } catch (error) {
      console.error('Error announcing raid completion:', error);
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
          // Check if we sent a DM recently (limit to once per minute)
          if (participant.last_dm_sent) {
            const timeSinceLastDM = now.getTime() - new Date(participant.last_dm_sent).getTime();
            if (timeSinceLastDM < 60000) { // Less than 1 minute
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
          } else {
            // Send Audius progress DM (using bot method)
            if (this.client.bot && typeof this.client.bot.sendUserProgressDM === 'function') {
              await this.client.bot.sendUserProgressDM(
                discordUser, 
                raid, 
                participant.total_listen_duration, 
                participant.is_listening
              );
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

      // Clean up expired OAuth sessions
      await PrismaDatabase.cleanupExpiredSessions();

      // Clean up Spotify tracking sessions
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
    // Audius tracking is handled by the main monitoring loop
    
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

      console.log(`➕ Added ${raid.platform} participant ${discordId} to raid ${raidId}`);
    } catch (error) {
      console.error(`Error adding participant ${discordId} to raid ${raidId}:`, error);
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
