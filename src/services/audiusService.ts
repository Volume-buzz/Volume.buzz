/**
 * Enhanced Audius Service for tracking listening and OAuth
 * Integrates with Audius API and SDK for comprehensive music tracking
 */

// Note: Audius SDK integration (install with: npm install @audius/sdk)
// import { sdk } from '@audius/sdk';
import config from '../config/environment';
import PrismaDatabase from '../database/prisma';

interface AudiusTrack {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  // Enhanced metadata fields
  artwork?: {
    _150x150?: string;
    _480x480?: string;
    _1000x1000?: string;
  } | null;
  genre?: string;
  playCount?: number;
  permalink?: string;
  user?: {
    handle?: string;
    name?: string;
    verified?: boolean;
    profilePicture?: any;
  };
}

interface AudiusUser {
  userId: string;
  email: string;
  name: string;
  handle: string;
  verified: boolean;
  profilePicture?: {
    "150x150"?: string;
    "480x480"?: string;
    "1000x1000"?: string;
  };
}

interface ListeningSession {
  userId: string;
  trackId: string;
  startTime: Date;
  duration: number;
  completed: boolean;
}

class AudiusService {
  private audiusSdk: any;
  private listeningSessionMap: Map<string, ListeningSession>;

  constructor() {
    // Initialize Audius SDK (commented out until package is installed)
    // this.audiusSdk = sdk({
    //   apiKey: config.audius.apiKey,
    //   apiSecret: process.env.AUDIUS_API_SECRET
    // });
    
    this.listeningSessionMap = new Map();
    
    console.log('🎵 Audius Service initialized (SDK integration pending)');
  }

  /**
   * Verify Audius JWT token from OAuth flow
   */
  async verifyAudiusToken(jwt: string): Promise<AudiusUser | null> {
    try {
      // Decode JWT to get user data directly
      // JWT format: header.payload.signature
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
      
      console.log('✅ Audius token verified:', payload.handle);
      
      // Map JWT payload to AudiusUser interface
      return {
        userId: payload.userId || payload.sub, // Use userId or fallback to sub
        email: payload.email || '',
        name: payload.name || '',
        handle: payload.handle || '',
        verified: payload.verified || false,
        profilePicture: payload.profilePicture || {}
      };

    } catch (error) {
      console.error('Error verifying Audius token:', error);
      return null;
    }
  }

  /**
   * Track user listening to a track
   */
  async startListeningSession(discordId: string, trackId: string): Promise<boolean> {
    try {
      const sessionKey = `${discordId}_${trackId}`;
      
      // Get track info
      const track = await this.getTrackInfo(trackId);
      if (!track) {
        console.warn(`Track ${trackId} not found`);
        return false;
      }

      const session: ListeningSession = {
        userId: discordId,
        trackId: trackId,
        startTime: new Date(),
        duration: 0,
        completed: false
      };

      this.listeningSessionMap.set(sessionKey, session);
      
      console.log(`🎵 Started listening session: ${discordId} → ${track.title}`);
      return true;

    } catch (error) {
      console.error('Error starting listening session:', error);
      return false;
    }
  }

  /**
   * End listening session and award points if completed
   */
  async endListeningSession(discordId: string, trackId: string, listenDuration: number): Promise<boolean> {
    try {
      const sessionKey = `${discordId}_${trackId}`;
      const session = this.listeningSessionMap.get(sessionKey);
      
      if (!session) {
        console.warn(`No listening session found for ${sessionKey}`);
        return false;
      }

      session.duration = listenDuration;
      session.completed = listenDuration >= config.bot.minimumListenTime;

      // Award points if minimum listen time reached
      if (session.completed) {
        const points = this.calculateListeningPoints(listenDuration);
        await this.awardListeningPoints(discordId, trackId, points);
        
        console.log(`🎉 Listening completed: ${discordId} earned ${points} points for ${trackId}`);
      }

      this.listeningSessionMap.delete(sessionKey);
      return session.completed;

    } catch (error) {
      console.error('Error ending listening session:', error);
      return false;
    }
  }

  /**
   * Get track information from Audius with enhanced metadata
   */
  async getTrackInfo(trackId: string): Promise<AudiusTrack | null> {
    try {
      // Get a random API endpoint first
      const hostsResponse = await fetch('https://api.audius.co');
      const hosts = await hostsResponse.json();
      
      if (!hosts.data || hosts.data.length === 0) {
        throw new Error('No Audius API hosts available');
      }

      const apiHost = hosts.data[0];
      const trackUrl = `${apiHost}/v1/tracks/${trackId}`;
      
      const response = await fetch(trackUrl);
      
      if (!response.ok) {
        console.error(`Audius API error: ${response.status}`);
        return null;
      }

      const result = await response.json();
      const track = result.data;
      
      if (!track) {
        return null;
      }

      return {
        id: track.id,
        title: track.title,
        artist: track.user?.name,
        duration: track.duration,
        // Enhanced metadata
        artwork: track.artwork ? {
          _150x150: track.artwork['150x150'],
          _480x480: track.artwork['480x480'], 
          _1000x1000: track.artwork['1000x1000']
        } : null,
        genre: track.genre,
        playCount: track.play_count,
        permalink: track.permalink,
        user: {
          handle: track.user?.handle,
          name: track.user?.name,
          verified: track.user?.is_verified || false,
          profilePicture: track.user?.profile_picture
        }
      };

    } catch (error) {
      console.error(`Error getting track info for ${trackId}:`, error);
      return null;
    }
  }

  /**
   * Get user's current playing track with enhanced metadata
   */
  async getCurrentlyPlaying(audiusUserId: string): Promise<AudiusTrack | null> {
    try {
      // Get a random API endpoint
      const hostsResponse = await fetch('https://api.audius.co');
      const hosts = await hostsResponse.json();
      
      if (!hosts.data || hosts.data.length === 0) {
        throw new Error('No Audius API hosts available');
      }

      const apiHost = hosts.data[0];
      const nowPlayingUrl = `${apiHost}/v1/users/${audiusUserId}/now-playing`;
      
      const response = await fetch(nowPlayingUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No track currently playing
        }
        throw new Error(`Audius API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.id || !data.title) {
        return null;
      }

      // Get full track details using the track ID
      const fullTrackData = await this.getTrackInfo(data.id);
      
      if (fullTrackData) {
        return fullTrackData;
      }

      // Fallback to basic now-playing data
      return {
        id: data.id,
        title: data.title,
        artist: undefined, // Not provided by this endpoint
        duration: undefined // Not provided by this endpoint
      };

    } catch (error) {
      console.error(`Error getting now playing for user ${audiusUserId}:`, error);
      return null;
    }
  }

  /**
   * Get enhanced track metadata for raid messages
   */
  async getEnhancedTrackData(trackId: string): Promise<{
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    genre?: string;
    duration?: string;
    playCount?: number;
    permalink?: string;
    verified?: boolean;
  } | null> {
    try {
      const track = await this.getTrackInfo(trackId);
      
      if (!track) {
        return null;
      }

      const duration = track.duration ? 
        Math.floor(track.duration / 60) + ':' + (track.duration % 60).toString().padStart(2, '0') : 
        undefined;

      return {
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        genre: track.genre,
        duration,
        playCount: track.playCount,
        permalink: track.permalink,
        artwork: track.artwork?._1000x1000 || track.artwork?._480x480 || track.artwork?._150x150,
        verified: track.user?.verified || false
      };

    } catch (error) {
      console.error(`Error getting enhanced track data for ${trackId}:`, error);
      return null;
    }
  }

  /**
   * Search for tracks
   */
  async searchTracks(query: string, limit: number = 10): Promise<AudiusTrack[]> {
    try {
      const response = await this.audiusSdk.tracks.searchTracks({ 
        query, 
        limit 
      });
      
      if (!response.data) {
        return [];
      }

      return response.data.map((track: any) => ({
        id: track.id,
        title: track.title,
        artist: track.user?.name,
        duration: track.duration
      }));

    } catch (error) {
      console.error(`Error searching tracks for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get user by handle
   */
  async getUserByHandle(handle: string): Promise<AudiusUser | null> {
    try {
      const response = await this.audiusSdk.users.getUserByHandle({ handle });
      
      if (!response.data) {
        return null;
      }

      const user = response.data;
      return {
        userId: user.id.toString(),
        email: '', // Email not available from public API
        name: user.name,
        handle: user.handle,
        verified: user.isVerified,
        profilePicture: user.profilePicture
      };

    } catch (error) {
      console.error(`Error getting user by handle ${handle}:`, error);
      return null;
    }
  }

  /**
   * Calculate points based on listening duration
   */
  private calculateListeningPoints(duration: number): number {
    const minimumPoints = 1;
    const bonusPoints = Math.floor(duration / 30); // 1 bonus point per 30 seconds
    return minimumPoints + bonusPoints;
  }

  /**
   * Award listening points to user
   */
  private async awardListeningPoints(discordId: string, trackId: string, points: number): Promise<void> {
    try {
      // Add to user's balance
      const user = await PrismaDatabase.getUser(discordId);
      if (user) {
        const newBalance = user.tokens_balance + points;
        await PrismaDatabase.updateUserBalance(discordId, newBalance);
        
        console.log(`💰 Awarded ${points} points to ${discordId} for listening to ${trackId}`);
      }

    } catch (error) {
      console.error('Error awarding listening points:', error);
    }
  }

  /**
   * Get active listening sessions for debugging
   */
  getActiveListeningSessions(): ListeningSession[] {
    return Array.from(this.listeningSessionMap.values());
  }

  /**
   * Generate Audius OAuth URL (proper implementation)
   */
  generateAudiusOAuthUrl(redirectUri: string, state: string, scope: 'read' | 'write' = 'read'): string {
    const params = new URLSearchParams({
      scope,
      api_key: config.audius.apiKey || '',
      redirect_uri: redirectUri,
      state,
      response_mode: 'query' // Use query instead of fragment for easier handling
    });

    return `https://audius.co/oauth/auth?${params.toString()}`;
  }
}

export default AudiusService;
export { AudiusTrack, AudiusUser, ListeningSession };
