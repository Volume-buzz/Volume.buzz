/**
 * Listening Tracker Service
 * Manages active listening sessions for Audius parties
 * Handles heartbeat polling and progress updates
 */

import axios from 'axios';
import { Client, EmbedBuilder, User } from 'discord.js';
import config from '../config/environment';
import { LISTENING_PARTY_CONSTANTS } from '../config/listeningPartyConstants';

const API_BASE = config.api.publicUrl || 'http://localhost:3001';

interface ActiveSession {
  partyId: string;
  discordId: string;
  audiusUserId: string;
  trackId: string;
  intervalId: NodeJS.Timeout;
  startTime: number;
  lastUpdate: number;
  duration: number;
  qualified: boolean;
}

class ListeningTracker {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private client: Client;
  private readonly HEARTBEAT_INTERVAL = LISTENING_PARTY_CONSTANTS.HEARTBEAT_INTERVAL_MS;
  private readonly PROGRESS_UPDATE_INTERVAL = LISTENING_PARTY_CONSTANTS.PROGRESS_UPDATE_INTERVAL_MS;
  private readonly QUALIFYING_DURATION = LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Start tracking a user's listening session
   */
  async startTracking(
    partyId: string,
    discordId: string,
    audiusUserId: string,
    trackId: string,
    trackTitle: string
  ): Promise<{ success: boolean; message: string }> {
    const key = `${partyId}_${discordId}`;

    // Check if already tracking
    if (this.activeSessions.has(key)) {
      return {
        success: false,
        message: 'Already tracking this session',
      };
    }

    try {
      // Call API to start tracking
      const response = await axios.post(`${API_BASE}/api/audius/start-tracking`, {
        party_id: partyId,
        discord_id: discordId,
        audius_user_id: audiusUserId,
        track_id: trackId,
      });

      if (!response.data.success) {
        return {
          success: false,
          message: response.data.message || 'Failed to start tracking',
        };
      }

      // Send initial DM
      await this.sendDM(
        discordId,
        `🎵 **Listening Verification Started**\n\nTrack: **${trackTitle}**\n\nWe're tracking your listening progress. You'll receive updates as you listen!`
      );

      // Create session
      const session: ActiveSession = {
        partyId,
        discordId,
        audiusUserId,
        trackId,
        intervalId: null as any,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        duration: 0,
        qualified: false,
      };

      // Start heartbeat interval
      session.intervalId = setInterval(() => {
        this.sendHeartbeat(key, session, trackTitle);
      }, this.HEARTBEAT_INTERVAL);

      this.activeSessions.set(key, session);

      console.log(`🎵 Started tracking ${discordId} for party ${partyId}`);

      return {
        success: true,
        message: 'Tracking started successfully',
      };
    } catch (error: any) {
      console.error('Error starting tracking:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to start tracking',
      };
    }
  }

  /**
   * Send heartbeat to API and update user
   */
  private async sendHeartbeat(key: string, session: ActiveSession, trackTitle: string) {
    try {
      // Call heartbeat API
      const response = await axios.post(`${API_BASE}/api/audius/heartbeat`, {
        party_id: session.partyId,
        discord_id: session.discordId,
        audius_user_id: session.audiusUserId,
        track_id: session.trackId,
      });

      const { qualified, listeningDuration, isPlaying } = response.data;

      const previouslyQualified = session.qualified;
      session.duration = listeningDuration;
      session.qualified = qualified;

      // If not playing the correct track, warn user
      if (!isPlaying) {
        await this.sendDM(
          session.discordId,
          `⚠️ **Playback Not Detected**\n\nWe couldn't verify that you're playing the track. Please make sure:\n1. You clicked "Play" and the track is playing on Audius\n2. You're playing the correct track\n\nYour progress has been paused.`
        );
        this.stopTracking(key);
        return;
      }

      // Send progress update every 9 seconds (every 3rd heartbeat)
      const timeSinceLastUpdate = Date.now() - session.lastUpdate;

      // If newly qualified, send a final progress update (if needed) and stop tracking
      if (qualified && !previouslyQualified) {
        if (timeSinceLastUpdate >= this.PROGRESS_UPDATE_INTERVAL) {
          await this.sendProgressUpdate(session, trackTitle);
        }
        await this.sendQualifiedNotification(session, trackTitle);
        this.stopTracking(key);
        return;
      }

      if (timeSinceLastUpdate >= this.PROGRESS_UPDATE_INTERVAL) {
        await this.sendProgressUpdate(session, trackTitle);
        session.lastUpdate = Date.now();
      }
    } catch (error: any) {
      console.error('Error sending heartbeat:', error);

      // If error, stop tracking
      this.stopTracking(key);

      await this.sendDM(
        session.discordId,
        `❌ **Tracking Error**\n\nWe encountered an error while tracking your listening session. Please try clicking "Listen" again.`
      );
    }
  }

  /**
   * Send progress update to user
   */
  private async sendProgressUpdate(session: ActiveSession, trackTitle: string) {
    const percentage = Math.min((session.duration / this.QUALIFYING_DURATION) * 100, 100);
    const totalSegments = 10;
    const rawFilled = Math.round((percentage / 100) * totalSegments);
    const filledSegments = Math.min(Math.max(rawFilled, percentage > 0 ? 1 : 0), totalSegments);
    const emptySegments = Math.max(totalSegments - filledSegments, 0);
    const progressBar = `${'🟩'.repeat(filledSegments)}${'⬜'.repeat(emptySegments)}`;

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('🎵 Listening Progress')
      .setDescription(`**${trackTitle}**`)
      .addFields(
        {
          name: 'Progress',
          value: `${progressBar} ${percentage.toFixed(0)}%`,
          inline: false,
        },
        {
          name: 'Time',
          value: `${session.duration}s / ${this.QUALIFYING_DURATION}s`,
          inline: true,
        },
        {
          name: 'Status',
          value: session.duration >= this.QUALIFYING_DURATION ? '✅ Qualified!' : '🎧 Listening...',
          inline: true,
        }
      )
      .setTimestamp();

    try {
      const user = await this.client.users.fetch(session.discordId);
      await user.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error sending progress update:', error);
    }
  }

  /**
   * Send qualified notification
   */
  private async sendQualifiedNotification(session: ActiveSession, trackTitle: string) {
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ Qualified!')
      .setDescription(`**${trackTitle}**\n\nYou've listened for ${this.QUALIFYING_DURATION} seconds and are now qualified to claim rewards!`)
      .addFields({
        name: 'Next Step',
        value: 'Click the **Claim** button on the party message in Discord to claim your rewards!',
        inline: false,
      })
      .setTimestamp();

    try {
      const user = await this.client.users.fetch(session.discordId);
      await user.send({ embeds: [embed] });

      console.log(`✅ User ${session.discordId} qualified for party ${session.partyId}`);
    } catch (error) {
      console.error('Error sending qualified notification:', error);
    }
  }

  /**
   * Stop tracking a session
   */
  stopTracking(key: string) {
    const session = this.activeSessions.get(key);
    if (session) {
      clearInterval(session.intervalId);
      this.activeSessions.delete(key);
      console.log(`🛑 Stopped tracking ${session.discordId} for party ${session.partyId}`);
    }
  }

  /**
   * Stop tracking by party and discord ID
   */
  stopTrackingByIds(partyId: string, discordId: string) {
    const key = `${partyId}_${discordId}`;
    this.stopTracking(key);
  }

  /**
   * Check if user is being tracked
   */
  isTracking(partyId: string, discordId: string): boolean {
    const key = `${partyId}_${discordId}`;
    return this.activeSessions.has(key);
  }

  /**
   * Get session info
   */
  getSession(partyId: string, discordId: string): ActiveSession | null {
    const key = `${partyId}_${discordId}`;
    return this.activeSessions.get(key) || null;
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Stop all tracking sessions
   */
  stopAll() {
    for (const session of this.activeSessions.values()) {
      clearInterval(session.intervalId);
    }
    this.activeSessions.clear();
    console.log('🛑 Stopped all listening sessions');
  }

  /**
   * Helper to send DM to user
   */
  private async sendDM(discordId: string, message: string) {
    try {
      const user = await this.client.users.fetch(discordId);
      await user.send(message);
    } catch (error) {
      console.error(`Error sending DM to ${discordId}:`, error);
    }
  }
}

export default ListeningTracker;
