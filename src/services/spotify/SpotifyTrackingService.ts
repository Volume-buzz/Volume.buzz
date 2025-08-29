/**
 * Spotify Tracking Service
 * Monitors user listening activity for raid participation
 */

import { User as DiscordUser } from 'discord.js';
import SpotifyApiService from './SpotifyApiService';
import SpotifyAuthService from './SpotifyAuthService';
import PrismaDatabase from '../../database/prisma';
import { TrackingSession } from '../../types/spotify';
import config from '../../config/environment';

class SpotifyTrackingService {
  private apiService: SpotifyApiService;
  private authService: SpotifyAuthService;
  private trackingSessions: Map<string, TrackingSession> = new Map();
  private trackingInterval: NodeJS.Timeout | null = null;

  constructor(apiService: SpotifyApiService, authService: SpotifyAuthService) {
    this.apiService = apiService;
    this.authService = authService;
  }

  /**
   * Start tracking a user's listening session for a raid
   */
  async startTracking(
    discordId: string, 
    raidId: number, 
    trackId: string, 
    requiredTime: number
  ): Promise<void> {
    const sessionKey = `${discordId}-${raidId}`;
    
    const session: TrackingSession = {
      userId: discordId,
      raidId,
      trackId,
      platform: 'SPOTIFY',
      startTime: new Date(),
      totalListenTime: 0,
      isListening: false,
      lastCheck: new Date(),
      requiredTime,
      isPremium: await this.authService.isUserPremium(discordId)
    };

    this.trackingSessions.set(sessionKey, session);
    
    console.log(`🎧 Started Spotify tracking for user ${discordId} on raid ${raidId}`);
  }

  /**
   * Stop tracking a user's session
   */
  stopTracking(discordId: string, raidId: number): void {
    const sessionKey = `${discordId}-${raidId}`;
    this.trackingSessions.delete(sessionKey);
    
    console.log(`⏹️ Stopped Spotify tracking for user ${discordId} on raid ${raidId}`);
  }

  /**
   * Start the global tracking interval (every 3 seconds)
   */
  startGlobalTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
    }

    this.trackingInterval = setInterval(async () => {
      await this.checkAllSessions();
    }, 3000); // 3 second intervals as requested

    console.log('🎯 Started Spotify global tracking (3-second intervals)');
  }

  /**
   * Stop the global tracking interval
   */
  stopGlobalTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    console.log('⏹️ Stopped Spotify global tracking');
  }

  /**
   * Check all active tracking sessions
   */
  private async checkAllSessions(): Promise<void> {
    const sessions = Array.from(this.trackingSessions.values());
    
    for (const session of sessions) {
      await this.checkSession(session);
    }
  }

  /**
   * Check a specific tracking session
   */
  private async checkSession(session: TrackingSession): Promise<void> {
    try {
      const now = new Date();
      const timeSinceLastCheck = (now.getTime() - session.lastCheck.getTime()) / 1000;

      // Check if user is currently playing the raid track
      const playbackStatus = await this.apiService.isPlayingTrack(session.userId, session.trackId);
      
      const wasListening = session.isListening;
      session.isListening = playbackStatus.isPlaying;
      session.lastCheck = now;

      if (session.isListening) {
        // User is actively listening - add the time since last check
        session.totalListenTime += timeSinceLastCheck;
        
        // Update database with current progress
        const updateData: any = {
          is_listening: true,
          total_listen_duration: Math.floor(session.totalListenTime),
          last_check: now,
          qualified: session.totalListenTime >= session.requiredTime
        };

        if (session.totalListenTime >= session.requiredTime && !session.isListening) {
          updateData.qualified_at = now;
        }

        await PrismaDatabase.updateRaidParticipant(
          session.raidId, 
          session.userId, 
          updateData
        );

        console.log(`🎵 User ${session.userId} listening to Spotify track (${Math.floor(session.totalListenTime)}s/${session.requiredTime}s)`);
      } else {
        // User stopped listening - reset timer like Audius
        if (wasListening) {
          console.log(`⏸️ User ${session.userId} stopped listening to Spotify track - resetting timer`);
          session.totalListenTime = 0; // Reset timer when user stops
        }

        await PrismaDatabase.updateRaidParticipant(
          session.raidId, 
          session.userId, 
          {
            is_listening: false,
            total_listen_duration: Math.floor(session.totalListenTime),
            last_check: now
          }
        );
      }

    } catch (error: any) {
      console.error(`Error checking Spotify session for user ${session.userId}:`, error.message);
      
      // Mark user as not listening if we can't check their status
      session.isListening = false;
      
      await PrismaDatabase.updateRaidParticipant(
        session.raidId, 
        session.userId, 
        {
          is_listening: false,
          last_check: new Date()
        }
      );
    }
  }

  /**
   * Send progress DM to user
   */
  async sendProgressDM(
    discordUser: DiscordUser, 
    raid: any, 
    session: TrackingSession
  ): Promise<void> {
    try {
      const progressPercentage = Math.min((session.totalListenTime / session.requiredTime) * 100, 100);
      const progressBar = this.createProgressBar(progressPercentage, 10);
      
      let description: string;
      let color = 0x1DB954; // Spotify green

      if (!session.isListening) {
        description = `❌ **Not currently playing anything**\n\nPlease start playing **${raid.track_title}** on Spotify to continue earning!`;
        color = 0xFF6B6B;
      } else if (session.totalListenTime >= session.requiredTime) {
        description = `✅ **Qualified!** Wait for the raid to finish and claim your rewards!\n\n🎉 You've listened for **${Math.floor(session.totalListenTime)}** seconds (**${Math.floor(progressPercentage)}%** complete)`;
        color = 0x00FF00;
      } else {
        description = `🎶 **Currently listening to ${raid.track_title}** on Spotify\n\nListen time: **${Math.floor(session.totalListenTime)}**/${session.requiredTime} seconds`;
      }

      const embed = {
        title: `🎯 Spotify Raid Progress: ${raid.track_title}`,
        description: description,
        color: color,
        fields: [
          {
            name: '📊 Progress Bar',
            value: `${progressBar}`,
            inline: false
          },
          {
            name: '💰 Potential Reward',
            value: `${raid.reward_amount} tokens`,
            inline: true
          },
          {
            name: '⏱️ Required Time',
            value: `${session.requiredTime} seconds`,
            inline: true
          },
          {
            name: '🎶 Platform',
            value: session.isPremium ? 'Spotify Premium' : 'Spotify Free',
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Raid ID: ${raid.id} | Updates every 3 seconds`
        }
      };

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send Spotify progress DM:', error);
    }
  }

  /**
   * Create progress bar visualization
   */
  private createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    
    const filledBlocks = '█'.repeat(filled);
    const emptyBlocks = '░'.repeat(empty);
    
    return `[${filledBlocks}${emptyBlocks}] ${Math.round(percentage)}%`;
  }

  /**
   * Get active tracking session for user
   */
  getSession(discordId: string, raidId: number): TrackingSession | null {
    const sessionKey = `${discordId}-${raidId}`;
    return this.trackingSessions.get(sessionKey) || null;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): TrackingSession[] {
    return Array.from(this.trackingSessions.values());
  }

  /**
   * Remove inactive sessions (users who haven't been active for 5+ minutes)
   */
  cleanupInactiveSessions(): void {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [sessionKey, session] of this.trackingSessions.entries()) {
      const timeSinceLastCheck = now.getTime() - session.lastCheck.getTime();
      
      if (timeSinceLastCheck > inactiveThreshold && !session.isListening) {
        console.log(`🧹 Removing inactive Spotify session: ${sessionKey}`);
        this.trackingSessions.delete(sessionKey);
      }
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    premiumSessions: number;
    freeSessions: number;
  } {
    const sessions = Array.from(this.trackingSessions.values());
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.isListening).length,
      premiumSessions: sessions.filter(s => s.isPremium).length,
      freeSessions: sessions.filter(s => !s.isPremium).length
    };
  }
}

export default SpotifyTrackingService;
