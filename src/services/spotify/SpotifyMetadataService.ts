/**
 * Spotify Metadata Service
 * Handles fetching and processing enhanced track metadata for raids
 */

import SpotifyWebApi from 'spotify-web-api-node';
import { SpotifyTrack, EnhancedSpotifyMetadata, SpotifyRateLimitInfo } from '../../types/spotify';
import SpotifyAuthService from './SpotifyAuthService';

class SpotifyMetadataService {
  private spotifyApi: SpotifyWebApi;
  private authService: SpotifyAuthService;

  constructor(authService: SpotifyAuthService, config: { clientId: string; clientSecret: string; redirectUri: string }) {
    this.authService = authService;
    this.spotifyApi = new SpotifyWebApi({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri
    });
  }

  /**
   * Fetch enhanced metadata for a Spotify track with market relinking support
   */
  async getEnhancedTrackMetadata(
    trackId: string, 
    discordId?: string
  ): Promise<EnhancedSpotifyMetadata> {
    try {
      let accessToken: string | null = null;
      let market = 'US'; // Default market

      // Try to get user's access token and market for personalized results
      if (discordId) {
        accessToken = await this.authService.getValidAccessToken(discordId);
        if (accessToken) {
          this.spotifyApi.setAccessToken(accessToken);
          market = 'from_token'; // Use user's market
        }
      }

      // If no user token, use client credentials for public track data
      if (!accessToken) {
        await this.ensureClientCredentials();
      }

      // Fetch track with market parameter for relinking
      const trackResponse = await this.spotifyApi.getTrack(trackId, { market });
      const track = trackResponse.body as SpotifyTrack;

      // Process album artwork
      const albumArtwork = this.processAlbumArtwork(track.album.images);

      // Format duration
      const formattedDuration = this.formatDuration(track.duration_ms);

      // Format artist names
      const artistNames = track.artists.map(artist => artist.name).join(', ');

      // Process album info
      const albumInfo = {
        name: track.album.name,
        releaseDate: this.formatReleaseDate(track.album.release_date, track.album.release_date_precision),
        type: track.album.album_type
      };

      const metadata: EnhancedSpotifyMetadata = {
        track,
        originalTrackId: trackId,
        linkedTrackId: track.linked_from?.id,
        isPlayable: track.is_playable !== false, // Default to true if not specified
        market: market === 'from_token' ? undefined : market,
        fetchedAt: new Date(),
        albumArtwork,
        formattedDuration,
        artistNames,
        albumInfo
      };

      console.log(`📊 Fetched enhanced metadata for track ${trackId}${track.linked_from ? ` (relinked to ${track.linked_from.id})` : ''}`);
      return metadata;

    } catch (error: any) {
      // Handle rate limiting
      if (error.statusCode === 429) {
        const retryAfter = parseInt(error.headers?.['retry-after'] || '1');
        console.warn(`⏱️ Spotify rate limited, retry after ${retryAfter}s`);
        throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
      }

      console.error(`Failed to fetch track metadata for ${trackId}:`, error);
      throw new Error(`Failed to fetch track metadata: ${error.message}`);
    }
  }

  /**
   * Get track by Spotify URL or URI
   */
  async getTrackFromUrl(url: string, discordId?: string): Promise<EnhancedSpotifyMetadata> {
    const trackId = this.extractTrackIdFromUrl(url);
    if (!trackId) {
      throw new Error('Invalid Spotify track URL or URI');
    }
    return this.getEnhancedTrackMetadata(trackId, discordId);
  }

  /**
   * Extract track ID from Spotify URL or URI
   */
  private extractTrackIdFromUrl(url: string): string | null {
    // Handle Spotify URIs: spotify:track:4iV5W9uYEdYUVa79Axb7Rh
    if (url.startsWith('spotify:track:')) {
      return url.split(':')[2];
    }

    // Handle Spotify URLs: https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    const urlMatch = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    return null;
  }

  /**
   * Process album artwork into different sizes
   */
  private processAlbumArtwork(images: Array<{ url: string; height?: number; width?: number }>): {
    large?: string;
    medium?: string;
    small?: string;
  } {
    const artwork: any = {};
    
    // Sort by size (largest first)
    const sortedImages = images.sort((a, b) => (b.height || 0) - (a.height || 0));
    
    for (const image of sortedImages) {
      const size = image.height || 0;
      if (size >= 600 && !artwork.large) {
        artwork.large = image.url;
      } else if (size >= 200 && size < 600 && !artwork.medium) {
        artwork.medium = image.url;
      } else if (size < 200 && !artwork.small) {
        artwork.small = image.url;
      }
    }

    // Fallback: use largest available for missing sizes
    if (sortedImages.length > 0) {
      const fallback = sortedImages[0].url;
      artwork.large = artwork.large || fallback;
      artwork.medium = artwork.medium || fallback;
      artwork.small = artwork.small || fallback;
    }

    return artwork;
  }

  /**
   * Format duration from milliseconds to human readable
   */
  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format release date based on precision
   */
  private formatReleaseDate(releaseDate: string, precision: string): string {
    switch (precision) {
      case 'day':
        return new Date(releaseDate).toLocaleDateString();
      case 'month':
        return new Date(releaseDate + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      case 'year':
      default:
        return releaseDate;
    }
  }

  /**
   * Ensure client credentials token for public API calls
   */
  private async ensureClientCredentials(): Promise<void> {
    try {
      const data = await this.spotifyApi.clientCredentialsGrant();
      this.spotifyApi.setAccessToken(data.body.access_token);
      
      // Set refresh timer for client credentials (they expire after 1 hour)
      setTimeout(() => {
        this.spotifyApi.resetAccessToken();
      }, (data.body.expires_in - 60) * 1000); // Refresh 1 minute before expiry
      
    } catch (error: any) {
      throw new Error(`Failed to get client credentials: ${error.message}`);
    }
  }

  /**
   * Extract rate limit info from Spotify API response headers
   */
  extractRateLimitInfo(headers: any): SpotifyRateLimitInfo {
    return {
      retryAfter: headers['retry-after'] ? parseInt(headers['retry-after']) : undefined,
      remaining: headers['x-ratelimit-remaining'] ? parseInt(headers['x-ratelimit-remaining']) : undefined,
      resetTime: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : undefined
    };
  }

  /**
   * Validate if track is suitable for raids (not local file, available, etc.)
   */
  validateTrackForRaid(track: SpotifyTrack): { isValid: boolean; reason?: string } {
    if (track.is_local) {
      return { isValid: false, reason: 'Local files cannot be used for raids' };
    }

    if (track.duration_ms < 15000) { // Less than 15 seconds
      return { isValid: false, reason: 'Track is too short for raids (minimum 15 seconds)' };
    }

    if (track.is_playable === false) {
      return { isValid: false, reason: 'Track is not playable in this market' };
    }

    return { isValid: true };
  }
}

export default SpotifyMetadataService;
