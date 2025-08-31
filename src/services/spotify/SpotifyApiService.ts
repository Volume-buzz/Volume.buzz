/**
 * Spotify API Service
 * Handles Web API calls for track info, playback state, and control
 */

import SpotifyWebApi from 'spotify-web-api-node';
import { 
  SpotifyTrack, 
  SpotifyCurrentlyPlaying, 
  SpotifySearchResults,
  PlatformTrack 
} from '../../types/spotify';
import SpotifyAuthService from './SpotifyAuthService';
import SpotifyRateLimitService from './SpotifyRateLimitService';

class SpotifyApiService {
  private spotifyApi: SpotifyWebApi;
  private authService: SpotifyAuthService;
  private rateLimitService: SpotifyRateLimitService;

  constructor(authService: SpotifyAuthService, config?: { clientId: string; clientSecret: string }) {
    this.authService = authService;
    this.rateLimitService = SpotifyRateLimitService.getInstance();
    
    // Configure with client credentials for public API calls
    this.spotifyApi = new SpotifyWebApi(config ? {
      clientId: config.clientId,
      clientSecret: config.clientSecret
    } : {});
  }

  /**
   * Search for tracks on Spotify
   */
  async searchTracks(query: string, limit: number = 20): Promise<SpotifyTrack[]> {
    try {
      // Use client credentials for public searches (no user auth required)
      await this.ensureClientCredentials();
      
      const searchResult = await this.spotifyApi.searchTracks(query, { limit });
      return (searchResult.body.tracks?.items || []) as SpotifyTrack[];
    } catch (error: any) {
      console.error('Error searching Spotify tracks:', error);
      throw new Error(`Spotify search failed: ${error.message}`);
    }
  }

  /**
   * Get track information by Spotify URL or ID
   */
  async getTrackById(trackId: string): Promise<SpotifyTrack> {
    try {
      await this.ensureClientCredentials();
      
      const trackData = await this.spotifyApi.getTrack(trackId);
      return trackData.body as SpotifyTrack;
    } catch (error: any) {
      console.error(`Error getting Spotify track ${trackId}:`, error);
      throw new Error(`Failed to get track info: ${error.message}`);
    }
  }

  /**
   * Extract Spotify track ID from various URL formats
   */
  extractTrackIdFromUrl(url: string): string | null {
    const patterns = [
      /https?:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/, // Standard URL
      /spotify:track:([a-zA-Z0-9]+)/, // URI format
      /https?:\/\/spotify\.link\/([a-zA-Z0-9]+)/ // Short link
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Convert Spotify track to platform-agnostic format
   */
  convertToPlatformTrack(spotifyTrack: SpotifyTrack): PlatformTrack {
    return {
      id: spotifyTrack.id,
      title: spotifyTrack.name,
      artist: spotifyTrack.artists.map(a => a.name).join(', '),
      url: spotifyTrack.external_urls.spotify,
      artwork_url: spotifyTrack.album.images[0]?.url,
      duration_ms: spotifyTrack.duration_ms,
      platform: 'SPOTIFY',
      spotify_uri: spotifyTrack.uri,
      preview_url: spotifyTrack.preview_url || undefined
    };
  }

  /**
   * Get user's currently playing track with rate limiting
   */
  async getCurrentlyPlaying(discordId: string): Promise<SpotifyCurrentlyPlaying | null> {
    const rateLimitKey = SpotifyRateLimitService.getUserKey(discordId, 'currently-playing');
    
    return this.rateLimitService.executeWithRateLimit(rateLimitKey, async () => {
      const accessToken = await this.authService.getValidAccessToken(discordId);
      if (!accessToken) {
        throw new Error('No valid access token available');
      }

      // Use direct API call to /me/player/currently-playing endpoint with market=from_token
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing?market=from_token', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 204) {
        return null; // No content - user not playing anything
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '30');
        const error: any = new Error(`Rate limited`);
        error.statusCode = 429;
        error.headers = { 'retry-after': retryAfter.toString() };
        throw error;
      }

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
      }

      const currentlyPlaying = await response.json();
      return currentlyPlaying || null;
    });
  }

  /**
   * Check if user is currently playing a specific track (supports track relinking)
   */
  async isPlayingTrack(discordId: string, trackId: string, linkedTrackId?: string): Promise<{
    isPlaying: boolean;
    progress_ms?: number;
    timestamp?: number;
    matchedTrackId?: string;
    deviceId?: string;
  }> {
    try {
      const currentlyPlaying = await this.getCurrentlyPlaying(discordId);
      
      if (!currentlyPlaying || !currentlyPlaying.item || !currentlyPlaying.is_playing) {
        return { isPlaying: false };
      }

      // Check if current track matches original track ID or linked track ID
      const currentTrackId = currentlyPlaying.item.id;
      const isOriginalTrack = currentTrackId === trackId;
      const isLinkedTrack = linkedTrackId && currentTrackId === linkedTrackId;
      const isMatch = isOriginalTrack || isLinkedTrack;
      
      return {
        isPlaying: Boolean(isMatch),
        progress_ms: currentlyPlaying.progress_ms || 0,
        timestamp: currentlyPlaying.timestamp,
        matchedTrackId: isMatch ? currentTrackId : undefined,
        deviceId: currentlyPlaying.device?.id || undefined
      };
    } catch (error: any) {
      // Handle rate limiting
      if (error.statusCode === 429) {
        const retryAfter = parseInt(error.headers?.['retry-after'] || '30');
        console.warn(`⏱️ Rate limited checking playback for ${discordId}, retry after ${retryAfter}s`);
        throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
      }

      console.error(`Error checking if user ${discordId} is playing track ${trackId}:`, error);
      
      // If it's an authentication error, the user needs to reconnect
      if (error.message?.includes('No valid access token available')) {
        console.log(`🔄 User ${discordId} needs to reconnect Spotify for raids to work`);
      }
      
      return { isPlaying: false };
    }
  }

  /**
   * Start playback of a specific track (premium users only)
   */
  async startTrackPlayback(discordId: string, spotifyUri: string, deviceId?: string): Promise<boolean> {
    try {
      const accessToken = await this.authService.getValidAccessToken(discordId);
      if (!accessToken) {
        throw new Error('No valid access token available');
      }

      const isPremium = await this.authService.isUserPremium(discordId);
      if (!isPremium) {
        throw new Error('Playback control is only available for Spotify Premium users');
      }

      this.spotifyApi.setAccessToken(accessToken);

      const playbackOptions: any = {
        uris: [spotifyUri]
      };

      if (deviceId) {
        playbackOptions.device_id = deviceId;
      }

      await this.spotifyApi.play(playbackOptions);
      
      console.log(`▶️ Started playback for user ${discordId}: ${spotifyUri}`);
      return true;
    } catch (error: any) {
      console.error(`Error starting playback for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Pause playback (premium users only)
   */
  async pausePlayback(discordId: string, deviceId?: string): Promise<boolean> {
    try {
      const accessToken = await this.authService.getValidAccessToken(discordId);
      if (!accessToken) {
        throw new Error('No valid access token available');
      }

      const isPremium = await this.authService.isUserPremium(discordId);
      if (!isPremium) {
        throw new Error('Playback control is only available for Spotify Premium users');
      }

      this.spotifyApi.setAccessToken(accessToken);

      const pauseOptions: any = {};
      if (deviceId) {
        pauseOptions.device_id = deviceId;
      }

      await this.spotifyApi.pause(pauseOptions);
      
      console.log(`⏸️ Paused playback for user ${discordId}`);
      return true;
    } catch (error: any) {
      console.error(`Error pausing playback for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Add track to user's playback queue (premium users only) with rate limiting
   */
  async addToQueue(discordId: string, spotifyUri: string, deviceId?: string): Promise<boolean> {
    const rateLimitKey = SpotifyRateLimitService.getUserKey(discordId, 'queue');
    
    try {
      return await this.rateLimitService.executeWithRateLimit(rateLimitKey, async () => {
        const accessToken = await this.authService.getValidAccessToken(discordId);
        if (!accessToken) {
          throw new Error('No valid access token available');
        }

        const isPremium = await this.authService.isUserPremium(discordId);
        if (!isPremium) {
          throw new Error('Queue control is only available for Spotify Premium users');
        }

        this.spotifyApi.setAccessToken(accessToken);

        const queueOptions: any = { uri: spotifyUri };
        if (deviceId) {
          queueOptions.device_id = deviceId;
        }

        await this.spotifyApi.addToQueue(spotifyUri, queueOptions);
        
        console.log(`➕ Added to queue for user ${discordId}: ${spotifyUri}`);
        return true;
      });
    } catch (error: any) {
      console.error(`Error adding to queue for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Get user's available devices
   */
  async getUserDevices(discordId: string): Promise<any[]> {
    try {
      const accessToken = await this.authService.getValidAccessToken(discordId);
      if (!accessToken) {
        return [];
      }

      this.spotifyApi.setAccessToken(accessToken);
      const devices = await this.spotifyApi.getMyDevices();
      
      return devices.body.devices || [];
    } catch (error: any) {
      console.error(`Error getting devices for user ${discordId}:`, error);
      return [];
    }
  }

  /**
   * Get user's playback state (more detailed than currently playing)
   */
  async getPlaybackState(discordId: string): Promise<any> {
    try {
      const accessToken = await this.authService.getValidAccessToken(discordId);
      if (!accessToken) {
        return null;
      }

      this.spotifyApi.setAccessToken(accessToken);
      const playbackState = await this.spotifyApi.getMyCurrentPlaybackState({
        market: 'US'
      });

      return (playbackState as any).body || null;
    } catch (error: any) {
      if (error.statusCode === 204) {
        return null; // No active playback
      }
      
      console.error(`Error getting playback state for user ${discordId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure client credentials are set for public API calls
   */
  private async ensureClientCredentials(): Promise<void> {
    try {
      if (!this.spotifyApi.getAccessToken()) {
        const clientCredentials = await this.spotifyApi.clientCredentialsGrant();
        this.spotifyApi.setAccessToken(clientCredentials.body.access_token);
        
        // Set up auto-refresh before expiration
        setTimeout(() => {
          this.spotifyApi.resetAccessToken();
        }, (clientCredentials.body.expires_in - 60) * 1000); // Refresh 1 minute before expiry
      }
    } catch (error: any) {
      console.error('Failed to get client credentials:', error);
      throw new Error('Failed to authenticate with Spotify API');
    }
  }

  /**
   * Parse Spotify URL to get track information
   */
  async getTrackFromUrl(url: string): Promise<PlatformTrack> {
    const trackId = this.extractTrackIdFromUrl(url);
    if (!trackId) {
      throw new Error('Invalid Spotify URL format');
    }

    const spotifyTrack = await this.getTrackById(trackId);
    return this.convertToPlatformTrack(spotifyTrack);
  }

  /**
   * Get multiple tracks by IDs
   */
  async getTracks(trackIds: string[]): Promise<SpotifyTrack[]> {
    try {
      await this.ensureClientCredentials();
      
      const tracks = await this.spotifyApi.getTracks(trackIds);
      return tracks.body.tracks.filter(track => track !== null) as SpotifyTrack[];
    } catch (error: any) {
      console.error('Error getting multiple tracks:', error);
      throw new Error(`Failed to get tracks: ${error.message}`);
    }
  }

  /**
   * Check if a URL is a valid Spotify track URL
   */
  static isSpotifyUrl(url: string): boolean {
    const patterns = [
      /https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/,
      /spotify:track:[a-zA-Z0-9]+/,
      /https?:\/\/spotify\.link\/[a-zA-Z0-9]+/
    ];

    return patterns.some(pattern => pattern.test(url));
  }
}

export default SpotifyApiService;
