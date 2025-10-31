/**
 * Audius Verification Service
 * Handles listening verification for Audius platform using the Audius API
 */

import axios from 'axios';
import { prisma } from '../database/prisma';
import { LISTENING_PARTY_CONSTANTS } from '../config/listeningPartyConstants';

interface NowPlayingResponse {
  data: {
    id: string;
    title: string;
  } | null;
}

interface HeartbeatResult {
  qualified: boolean;
  canClaim: boolean;
  listeningDuration: number;
  requiredDuration: number;
  progress: string;
  isPlaying: boolean;
}

export class AudiusVerificationService {
  private readonly AUDIUS_API_BASE = 'https://api.audius.co/v1';
  private readonly QUALIFYING_THRESHOLD = LISTENING_PARTY_CONSTANTS.QUALIFYING_THRESHOLD;
  private readonly HEARTBEAT_INTERVAL = LISTENING_PARTY_CONSTANTS.HEARTBEAT_INTERVAL;
  private readonly MAX_VERIFICATION_ATTEMPTS = LISTENING_PARTY_CONSTANTS.MAX_VERIFICATION_ATTEMPTS;

  /**
   * Check what track a user is currently playing on Audius
   */
  async checkNowPlaying(audiusUserId: string): Promise<NowPlayingResponse['data']> {
    try {
      const response = await axios.get<NowPlayingResponse>(
        `${this.AUDIUS_API_BASE}/users/${audiusUserId}/now-playing`,
        {
          timeout: 5000,
        }
      );

      return response.data.data;
    } catch (error) {
      console.error(`Failed to check now-playing for user ${audiusUserId}:`, error);
      return null;
    }
  }

  /**
   * Verify if user is playing the correct track
   */
  async verifyListening(
    audiusUserId: string,
    expectedTrackId: string
  ): Promise<{ isPlaying: boolean; trackMatches: boolean }> {
    const nowPlaying = await this.checkNowPlaying(audiusUserId);

    if (!nowPlaying) {
      return { isPlaying: false, trackMatches: false };
    }

    return {
      isPlaying: true,
      trackMatches: nowPlaying.id === expectedTrackId,
    };
  }

  /**
   * Start tracking listening session for a participant
   * This is typically called when user clicks "Listen" button
   */
  async startTracking(
    partyId: string,
    discordId: string,
    audiusUserId: string,
    trackId: string
  ): Promise<{
    success: boolean;
    message: string;
    participantId?: string;
  }> {
    try {
      // Get or create participant
      const participant = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: partyId,
            discord_id: discordId,
          },
        },
      });

      if (!participant) {
        return {
          success: false,
          message: 'User has not joined this party. Please join first.',
        };
      }

      // Initial verification - check if user is playing the correct track
      let attempts = 0;
      let isVerified = false;

      while (attempts < this.MAX_VERIFICATION_ATTEMPTS && !isVerified) {
        const verification = await this.verifyListening(audiusUserId, trackId);

        if (verification.isPlaying && verification.trackMatches) {
          isVerified = true;
          break;
        }

        attempts++;
        if (attempts < this.MAX_VERIFICATION_ATTEMPTS) {
          // Wait before next attempt
          await new Promise((resolve) => setTimeout(resolve, this.HEARTBEAT_INTERVAL * 1000));
        }
      }

      if (!isVerified) {
        return {
          success: false,
          message:
            'Could not verify playback. Please make sure you are playing the correct track on Audius.',
        };
      }

      // Start heartbeat tracking
      await prisma.listeningPartyParticipant.update({
        where: { id: participant.id },
        data: {
          is_listening: true,
          first_heartbeat_at: participant.first_heartbeat_at || new Date(),
          last_heartbeat_at: new Date(),
        },
      });

      return {
        success: true,
        message: 'Listening verified! Tracking started.',
        participantId: participant.id,
      };
    } catch (error) {
      console.error('Error starting tracking:', error);
      return {
        success: false,
        message: 'Failed to start tracking session',
      };
    }
  }

  /**
   * Record a heartbeat and update listening progress
   */
  async recordHeartbeat(
    partyId: string,
    discordId: string,
    audiusUserId: string,
    trackId: string
  ): Promise<HeartbeatResult> {
    try {
      // Verify user is still playing the track
      const verification = await this.verifyListening(audiusUserId, trackId);

      // Get participant
      const participant = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: partyId,
            discord_id: discordId,
          },
        },
      });

      if (!participant) {
        throw new Error('Participant not found');
      }

      // Calculate listening duration increment
      const durationIncrement = verification.isPlaying && verification.trackMatches
        ? this.HEARTBEAT_INTERVAL
        : 0;

      // Update participant
      const updated = await prisma.listeningPartyParticipant.update({
        where: { id: participant.id },
        data: {
          is_listening: verification.isPlaying && verification.trackMatches,
          last_heartbeat_at: new Date(),
          total_listening_duration: {
            increment: durationIncrement,
          },
        },
      });

      // Check if qualified
      const qualified = updated.total_listening_duration >= this.QUALIFYING_THRESHOLD;

      // Update qualified status if reached threshold
      if (qualified && !participant.qualified_at) {
        await prisma.listeningPartyParticipant.update({
          where: { id: participant.id },
          data: {
            qualified_at: new Date(),
          },
        });
      }

      return {
        qualified,
        canClaim: qualified && !participant.claimed_at,
        listeningDuration: updated.total_listening_duration,
        requiredDuration: this.QUALIFYING_THRESHOLD,
        progress: `${updated.total_listening_duration}/${this.QUALIFYING_THRESHOLD}`,
        isPlaying: verification.isPlaying && verification.trackMatches,
      };
    } catch (error) {
      console.error('Error recording heartbeat:', error);
      throw error;
    }
  }

  /**
   * Stop tracking listening session
   */
  async stopTracking(partyId: string, discordId: string): Promise<void> {
    try {
      await prisma.listeningPartyParticipant.updateMany({
        where: {
          party_id: partyId,
          discord_id: discordId,
        },
        data: {
          is_listening: false,
        },
      });
    } catch (error) {
      console.error('Error stopping tracking:', error);
    }
  }

  /**
   * Get participant's listening progress
   */
  async getProgress(partyId: string, discordId: string): Promise<{
    duration: number;
    qualified: boolean;
    canClaim: boolean;
    progress: string;
  } | null> {
    try {
      const participant = await prisma.listeningPartyParticipant.findUnique({
        where: {
          party_id_discord_id: {
            party_id: partyId,
            discord_id: discordId,
          },
        },
      });

      if (!participant) {
        return null;
      }

      const qualified = participant.total_listening_duration >= this.QUALIFYING_THRESHOLD;

      return {
        duration: participant.total_listening_duration,
        qualified,
        canClaim: qualified && !participant.claimed_at,
        progress: `${participant.total_listening_duration}/${this.QUALIFYING_THRESHOLD}`,
      };
    } catch (error) {
      console.error('Error getting progress:', error);
      return null;
    }
  }
}

export default new AudiusVerificationService();
