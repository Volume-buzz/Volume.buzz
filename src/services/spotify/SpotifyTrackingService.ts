/**
 * Spotify Tracking Service
 * Monitors user listening activity for raid participation
 */

import { User as DiscordUser, EmbedBuilder as DiscordEmbedBuilder, Client } from 'discord.js';
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
  private client: Client;

  constructor(apiService: SpotifyApiService, authService: SpotifyAuthService, client: Client) {
    this.apiService = apiService;
    this.authService = authService;
    this.client = client;
  }

  /**
   * Start tracking a user's listening session for a raid
   */
  async startTracking(
    discordId: string, 
    raidId: number, 
    trackId: string, 
    requiredTime: number,
    linkedTrackId?: string
  ): Promise<void> {
    const sessionKey = `${discordId}-${raidId}`;
    
    // Check if user has valid Spotify auth before starting tracking
    const hasValidAuth = await this.authService.isUserAuthenticated(discordId);
    if (!hasValidAuth) {
      console.log(`🚫 User ${discordId} has no valid Spotify auth, sending reconnect DM and not starting tracking`);
      await this.sendAuthErrorDM(discordId, raidId);
      return;
    }

    // Determine tracking method based on user premium status
    const isPremium = await this.authService.isUserPremium(discordId);
    const trackingMethod = isPremium ? 'web_playback_sdk' : 'currently_playing_api';
    
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
      isPremium
    };

    this.trackingSessions.set(sessionKey, session);
    
    // Update database participant record with tracking method
    await PrismaDatabase.updateRaidParticipant(raidId, discordId, {
      tracking_method: trackingMethod,
      last_heartbeat_at: new Date()
    });
    
    console.log(`🎧 Started Spotify tracking for user ${discordId} on raid ${raidId} (${trackingMethod})`);
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
    }, 2000); // 2 second intervals as requested

    console.log('🎯 Started Spotify global tracking (2-second intervals)');
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

      // Get raid info for linked track ID
      const raid = await PrismaDatabase.getRaid(session.raidId);
      const linkedTrackId = raid?.linked_track_id || undefined;

      // Check if user is currently playing the raid track (with relinking support)
      let playbackStatus: any;
      try {
        playbackStatus = await this.apiService.isPlayingTrack(session.userId, session.trackId, linkedTrackId);
      } catch (error: any) {
        // Handle rate limiting
        if (error.message.includes('Rate limited')) {
          console.log(`⏱️ Rate limited for user ${session.userId}, skipping this check`);
          return;
        }

        // ALWAYS remove user from tracking on authentication errors to prevent spam
        console.log(`🚫 Authentication error for user ${session.userId}: ${error.message}`);
        console.log(`🔄 Removing user ${session.userId} from Spotify tracking to prevent error loop`);
        
        // Send auth error DM only once and remove from tracking
        await this.sendAuthErrorDM(session.userId, session.raidId);
        this.stopTracking(session.userId, session.raidId);
        return;
      }
      
      // Handle authentication errors - only send DM once and remove from tracking
      if (!playbackStatus && session.totalListenTime === 0) {
        // Likely authentication issue - user needs to reconnect
        await this.sendAuthErrorDM(session.userId, session.raidId);
        // Remove from tracking to stop continuous errors
        this.stopTracking(session.userId, session.raidId);
        return;
      }
      
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
          qualified: session.totalListenTime >= session.requiredTime,
          listen_seconds: Math.floor(session.totalListenTime),
          last_progress_ms: playbackStatus.progress_ms,
          last_timestamp: new Date(playbackStatus.timestamp || Date.now()),
          last_heartbeat_at: now,
          device_id: playbackStatus.deviceId
        };

        if (session.totalListenTime >= session.requiredTime && !wasListening) {
          updateData.qualified_at = now;
        }

        await PrismaDatabase.updateRaidParticipant(
          session.raidId, 
          session.userId, 
          updateData
        );

        console.log(`🎵 User ${session.userId} listening to Spotify track (${Math.floor(session.totalListenTime)}s/${session.requiredTime}s)`);
        
        // Check if user has qualified and stop tracking
        if (session.totalListenTime >= session.requiredTime) {
          console.log(`🎉 User ${session.userId} qualified for raid ${session.raidId}! Stopping tracking.`);
          
          // Send final qualification DM
          try {
            const discordUser = await this.client.users.fetch(session.userId);
            await this.sendQualificationDM(discordUser, raid, session);
          } catch (dmError) {
            console.warn(`Failed to send qualification DM to ${session.userId}:`, dmError);
          }
          
          // Stop tracking this user
          this.stopTracking(session.userId, session.raidId);
          return;
        }
      } else {
        // User stopped listening - reset timer
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
   * Send progress DM to user with enhanced metadata
   */
  async sendProgressDM(
    discordUser: DiscordUser, 
    raid: any, 
    session: TrackingSession
  ): Promise<void> {
    try {
      // Get current playing track metadata for richer information
      let currentTrackData: any = null;
      try {
        const playbackState = await this.apiService.getPlaybackState(session.userId);
        if (playbackState && playbackState.item) {
          currentTrackData = playbackState.item;
        }
      } catch (error) {
        // Fallback to basic info if we can't get current playback
        console.log('Using basic track info for progress DM');
      }

      const progressPercentage = Math.min((session.totalListenTime / session.requiredTime) * 100, 100);
      const progressBar = this.createProgressBar(progressPercentage, 15);
      
      let description: string;
      let color = 0x1DB954; // Spotify green
      const timeLeft = Math.max(0, session.requiredTime - Math.floor(session.totalListenTime));
      const minutesLeft = Math.floor(timeLeft / 60);
      const secondsLeft = timeLeft % 60;
      const timeLeftStr = minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;

      // Enhanced track info
      const trackTitle = currentTrackData ? currentTrackData.name : raid.track_title;
      const artistNames = currentTrackData ? 
        currentTrackData.artists.map((a: any) => a.name).join(', ') : 
        raid.track_artist;
      const albumName = currentTrackData ? currentTrackData.album.name : null;
      const spotifyUrl = `https://open.spotify.com/track/${raid.track_id}`;

      if (!session.isListening) {
        description = `❌ **Not currently playing the raid track**\n\n` +
          `🎵 Please start playing **[${trackTitle}](${spotifyUrl})** by **${artistNames}** on Spotify!\n\n` +
          (albumName ? `💿 **Album:** ${albumName}\n` : '') +
          `⏰ **${timeLeftStr}** remaining to qualify`;
        color = 0xFF6B6B;
      } else if (session.totalListenTime >= session.requiredTime) {
        description = `🏆 **RAID QUALIFICATION COMPLETE!**\n\n` +
          `🎉 You've successfully listened to **[${trackTitle}](${spotifyUrl})** for **${Math.floor(session.totalListenTime)}** seconds!\n\n` +
          `💎 **You can now claim your ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens in the raid channel!**`;
        color = 0x00FF00;
      } else {
        description = `🎶 **Currently vibing to [${trackTitle}](${spotifyUrl})**\n` +
          `🎤 by **${artistNames}**\n` +
          (albumName ? `💿 from **${albumName}**\n` : '') +
          `\n⏱️ **${timeLeftStr}** remaining to qualify for **${raid.reward_amount} ${raid.token_mint || 'SOL'}** tokens!`;
      }

      const embed = new DiscordEmbedBuilder()
        .setTitle((session.totalListenTime >= session.requiredTime) ? '🏆 Spotify Raid Complete!' : `🎧 Spotify Raid Progress`)
        .setDescription(description)
        .setColor(color);

      // Use album artwork if available from current playback
      if (currentTrackData && currentTrackData.album && currentTrackData.album.images.length > 0) {
        const albumArt = currentTrackData.album.images[0].url; // Largest available
        embed.setThumbnail(albumArt);
      } else if (raid.track_artwork_url) {
        embed.setThumbnail(raid.track_artwork_url);
      }

      embed.addFields(
        {
          name: '📊 Your Listening Progress',
          value: `${progressBar}\n**${Math.floor(session.totalListenTime)}**/${session.requiredTime} seconds (**${Math.floor(progressPercentage)}%** complete)`,
          inline: false
        },
        {
          name: (session.totalListenTime >= session.requiredTime) ? '🎉 Status' : '⏳ Time Remaining',
          value: (session.totalListenTime >= session.requiredTime) ? 
            '✅ **QUALIFIED!** Go claim your rewards!' :
            `⏳ **${timeLeftStr}** left to qualify`,
          inline: true
        },
        {
          name: '💰 Reward Pool',
          value: `**${raid.reward_amount}** ${raid.token_mint || 'SOL'} tokens`,
          inline: true
        },
        {
          name: '🎵 Spotify Status',
          value: session.isPremium ? '👑 Premium User' : '🆓 Free User',
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ 
        text: (session.totalListenTime >= session.requiredTime) ? 
          `Raid ID: ${raid.id} | 🎉 Claim rewards in Discord!` : 
          `Raid ID: ${raid.id} | 🔄 Updates every 2 seconds` 
      });

      // Add celebration image if qualified, otherwise add Spotify branding
      if (session.totalListenTime >= session.requiredTime) {
        embed.setImage('https://i.imgur.com/N6HhP5R.gif');
      }

      // Send or edit the existing DM message to avoid spamming the user
      const dmChannel = await discordUser.createDM();

      // Fetch existing participant record to get saved dm_message_id
      let participantRecord: any = null;
      try {
        participantRecord = await PrismaDatabase.checkExistingParticipant(session.raidId, session.userId);
      } catch (e) {
        // Non-fatal: proceed without participant record
      }

      const now = new Date();
      let sentOrEdited = false;

      if (participantRecord && participantRecord.dm_message_id) {
        try {
          const existingMessage: any = await dmChannel.messages.fetch(participantRecord.dm_message_id);
          if (existingMessage) {
            await existingMessage.edit({ embeds: [embed] });
            // Update last DM sent timestamp
            await PrismaDatabase.updateRaidParticipant(session.raidId, session.userId, {
              last_dm_sent: now
            });
            sentOrEdited = true;
          }
        } catch (fetchOrEditError) {
          // If the message was deleted or cannot be fetched, fall back to sending a new one
        }
      }

      if (!sentOrEdited) {
        const newMessage = await dmChannel.send({ embeds: [embed] });
        // Persist the new dm_message_id and timestamp for future edits
        await PrismaDatabase.updateRaidParticipant(session.raidId, session.userId, {
          dm_message_id: newMessage.id,
          last_dm_sent: now
        });
      }
    } catch (error) {
      console.error('Failed to send enhanced Spotify progress DM:', error);
    }
  }

  /**
   * Send qualification success DM to user
   */
  async sendQualificationDM(discordUser: any, raid: any, session: TrackingSession): Promise<void> {
    try {
      const embed = new DiscordEmbedBuilder()
        .setTitle('🎉 Raid Qualified!')
        .setDescription(
          `🏆 **Congratulations! You've completed the raid!**\n\n` +
          `🎵 **Track:** ${raid.track_title}\n` +
          `🎤 **Artist:** ${raid.track_artist}\n` +
          `⏱️ **Listening Time:** ${Math.floor(session.totalListenTime)}/${session.requiredTime} seconds\n\n` +
          `💰 **Reward Earned:** ${raid.reward_amount} ${raid.token_mint || 'SOL'} tokens\n\n` +
          `🎯 **Next Steps:**\n` +
          `• Wait for the raid to complete\n` +
          `• Use \`/claim\` to collect your rewards\n` +
          `• Check \`/wallet\` for your token balance\n\n` +
          `🎊 **Well done, raider!**`
        )
        .setColor(0xFFD700)
        .addFields(
          {
            name: '📊 Final Progress',
            value: `🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100%\n**${Math.floor(session.totalListenTime)}**/${session.requiredTime} seconds (**QUALIFIED!**)`
          },
          {
            name: '🎵 Platform',
            value: `Spotify${session.isPremium ? ' 👑 Premium' : ' 🆓 Free'}`,
            inline: true
          },
          {
            name: '💰 Reward',
            value: `**${raid.reward_amount}** ${raid.token_mint || 'SOL'} tokens`,
            inline: true
          }
        )
        .setImage('https://i.imgur.com/N6HhP5R.gif') // Celebration GIF
        .setTimestamp()
        .setFooter({ 
          text: `Raid ID: ${raid.id} | 🎉 Qualified at ${new Date().toLocaleTimeString()}`
        });

      if (raid.track_artwork_url) {
        embed.setThumbnail(raid.track_artwork_url);
      }

      await discordUser.send({ embeds: [embed] });
      
      console.log(`🎉 Sent qualification DM to ${discordUser.tag} for raid ${raid.id}`);
    } catch (error) {
      console.error('Failed to send qualification DM:', error);
    }
  }

  /**
   * Send authentication error DM to user
   */
  async sendAuthErrorDM(discordId: string, raidId: number): Promise<void> {
    try {
      const discordUser = await this.client.users.fetch(discordId);
      const raid = await PrismaDatabase.getRaid(raidId);
      
      if (!discordUser || !raid) return;

      const embed = new DiscordEmbedBuilder()
        .setTitle('🔄 Spotify Reconnection Required')
        .setDescription(
          `❌ **Your Spotify connection has expired or is invalid**\n\n` +
          `To participate in raids, you need to reconnect your Spotify account.\n\n` +
          `💡 **How to fix this:**\n` +
          `1. Use \`/spotify connect\` in Discord\n` +
          `2. Complete the Spotify authorization\n` +
          `3. Join the raid again\n\n` +
          `🎯 **Current Raid:** ${raid.track_title}\n` +
          `💰 **Reward:** ${raid.reward_amount} tokens`
        )
        .setColor(0xFF6B6B)
        .setTimestamp()
        .setFooter({ text: `Raid ID: ${raidId} | Reconnect to continue` });

      await discordUser.send({ embeds: [embed] });
      
      // Remove the user from the raid since they can't participate
      try {
        // Find the participant first, then delete by ID
        const participants = await PrismaDatabase.getActiveListeners();
        const participant = participants.find((p: any) => p.discord_id === discordId && p.raid_id === raidId);
        if (participant) {
          await PrismaDatabase.deleteRaidParticipant(participant.id);
        }
      } catch (removeError) {
        console.error(`Error removing participant:`, removeError);
      }
      console.log(`🚫 Removed user ${discordId} from raid ${raidId} due to auth issues`);
      
    } catch (error) {
      console.error('Failed to send auth error DM:', error);
    }
  }

  /**
   * Create progress bar visualization
   */
  private createProgressBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    
    return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` (${Math.floor(percentage)}%)`;
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
