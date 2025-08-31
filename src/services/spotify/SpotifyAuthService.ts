/**
 * Spotify Authentication Service
 * Handles OAuth flow, token management, and premium user detection
 */

import SpotifyWebApi from 'spotify-web-api-node';
import crypto from 'crypto';
import { SpotifyUser, SpotifyAuthTokens } from '../../types/spotify';
import EncryptionService from '../encryption';
import PrismaDatabase from '../../database/prisma';

export interface SpotifyOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

class SpotifyAuthService {
  private spotifyApi: SpotifyWebApi;
  private config: SpotifyOAuthConfig;
  private encryptionService: EncryptionService;

  // Required scopes for both free and premium users
  private readonly SPOTIFY_SCOPES = [
    'user-read-currently-playing',
    'user-read-playback-state', 
    'user-read-private',
    'user-read-email',
    'user-modify-playback-state',
    'streaming'
  ];

  constructor(config: SpotifyOAuthConfig) {
    this.config = config;
    this.spotifyApi = new SpotifyWebApi({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri
    });
    this.encryptionService = new EncryptionService();
  }

  /**
   * Generate Spotify OAuth authorization URL
   */
  generateAuthUrl(state: string): string {
    return this.spotifyApi.createAuthorizeURL(this.SPOTIFY_SCOPES, state, true);
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(authCode: string): Promise<SpotifyAuthTokens> {
    try {
      const data = await this.spotifyApi.authorizationCodeGrant(authCode);
      
      return {
        access_token: data.body.access_token,
        refresh_token: data.body.refresh_token,
        expires_in: data.body.expires_in,
        token_type: data.body.token_type as 'Bearer',
        scope: data.body.scope || this.SPOTIFY_SCOPES.join(' ')
      };
    } catch (error: any) {
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Get Spotify user profile information
   */
  async getUserProfile(accessToken: string): Promise<SpotifyUser> {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      const data = await this.spotifyApi.getMe();
      
      return {
        id: data.body.id,
        display_name: data.body.display_name || data.body.id,
        email: data.body.email || '',
        country: data.body.country || 'US',
        product: (data.body.product === 'premium' ? 'premium' : 'free') as 'premium' | 'free',
        images: (data.body.images || []).map(img => ({
          url: img.url,
          height: img.height || 0,
          width: img.width || 0
        })),
        followers: data.body.followers || { total: 0 },
        external_urls: data.body.external_urls || { spotify: '' }
      };
    } catch (error: any) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<SpotifyAuthTokens> {
    try {
      this.spotifyApi.setRefreshToken(refreshToken);
      const data = await this.spotifyApi.refreshAccessToken();

      return {
        access_token: data.body.access_token,
        refresh_token: data.body.refresh_token || refreshToken, // Some responses don't include new refresh token
        expires_in: data.body.expires_in,
        token_type: 'Bearer',
        scope: data.body.scope || this.SPOTIFY_SCOPES.join(' ')
      };
    } catch (error: any) {
      throw new Error(`Failed to refresh access token: ${error.message}`);
    }
  }

  /**
   * Save encrypted Spotify tokens to database
   */
  async saveUserTokens(discordId: string, tokens: SpotifyAuthTokens, userProfile: SpotifyUser, discordUsername?: string): Promise<void> {
    try {
      const encryptedAccessToken = this.encryptionService.encrypt(tokens.access_token);
      const encryptedRefreshToken = this.encryptionService.encrypt(tokens.refresh_token);
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      await PrismaDatabase.updateUser(discordId, {
        spotifyUserId: userProfile.id,
        spotifyDisplayName: userProfile.display_name,
        spotifyEmail: userProfile.email,
        spotifyIsPremium: userProfile.product === 'premium',
        discordUsername: discordUsername,
        spotifyAccessToken: JSON.stringify(encryptedAccessToken), // Store as JSON string
        spotifyRefreshToken: JSON.stringify(encryptedRefreshToken), // Store as JSON string
        spotifyTokenExpiresAt: expiresAt,
        spotifyScope: tokens.scope,
        spotifyProduct: userProfile.product,
        spotifyCountry: userProfile.country
      });

      console.log(`💾 Saved Spotify tokens for user ${discordId} (${userProfile.display_name}) - Premium: ${userProfile.product === 'premium'}`);
    } catch (error: any) {
      throw new Error(`Failed to save user tokens: ${error.message}`);
    }
  }

  /**
   * Get valid access token (refresh if expired)
   */
  async getValidAccessToken(discordId: string): Promise<string | null> {
    try {
      const user = await PrismaDatabase.getUser(discordId);
      
      if (!user?.spotify_access_token || !user?.spotify_refresh_token) {
        return null;
      }

      // Validate that tokens are actually strings and not corrupted
      if (typeof user.spotify_access_token !== 'string' || typeof user.spotify_refresh_token !== 'string') {
        console.log(`🔄 User ${discordId} has corrupted token data, clearing...`);
        await this.clearUserTokens(discordId);
        return null;
      }

      // Check if token is expired (with 5 minute buffer)
      const now = new Date();
      const expiresAt = user.spotify_token_expires_at;
      const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

      if (!expiresAt || (expiresAt.getTime() - bufferTime) <= now.getTime()) {
        console.log(`🔄 Refreshing Spotify token for user ${discordId}`);
        
        try {
          const refreshTokenData = JSON.parse(user.spotify_refresh_token);
          const decryptedRefreshToken = this.encryptionService.decrypt(refreshTokenData);
          const newTokens = await this.refreshAccessToken(decryptedRefreshToken);
          
          // Get updated user profile to check for premium status changes
          const userProfile = await this.getUserProfile(newTokens.access_token);
          
          await this.saveUserTokens(discordId, newTokens, userProfile);
          return newTokens.access_token;
        } catch (refreshError: any) {
          console.error(`Failed to refresh token for user ${discordId}:`, refreshError.message);
          // Clear corrupted tokens
          await this.clearUserTokens(discordId);
          return null;
        }
      }

      // Token is still valid - decrypt and return
      try {
        const accessTokenData = JSON.parse(user.spotify_access_token);
        return this.encryptionService.decrypt(accessTokenData);
      } catch (decryptError: any) {
        console.error(`Token decryption failed for user ${discordId}:`, decryptError.message);
        await this.clearUserTokens(discordId);
        return null;
      }
    } catch (error: any) {
      console.error(`Failed to get valid access token for user ${discordId}:`, error.message);
      await this.clearUserTokens(discordId);
      return null;
    }
  }

  /**
   * Clear user's Spotify tokens and notify tracking service
   */
  private async clearUserTokens(discordId: string): Promise<void> {
    try {
      await PrismaDatabase.updateUser(discordId, {
        spotifyAccessToken: undefined,
        spotifyRefreshToken: undefined,
        spotifyTokenExpiresAt: undefined
      });
      console.log(`🗑️ Cleared corrupted Spotify tokens for user ${discordId}`);
    } catch (error: any) {
      console.error(`Error clearing tokens for user ${discordId}:`, error.message);
    }
  }

  /**
   * Check if user has valid Spotify authentication
   */
  async isUserAuthenticated(discordId: string): Promise<boolean> {
    const token = await this.getValidAccessToken(discordId);
    return token !== null;
  }

  /**
   * Check if user is a Spotify Premium subscriber
   */
  async isUserPremium(discordId: string): Promise<boolean> {
    try {
      const user = await PrismaDatabase.getUser(discordId);
      return user?.spotify_is_premium || false;
    } catch (error) {
      console.error(`Failed to check premium status for user ${discordId}:`, error);
      return false;
    }
  }

  /**
   * Revoke Spotify authentication for user
   */
  async revokeUserAuth(discordId: string): Promise<void> {
    try {
      await PrismaDatabase.updateUser(discordId, {
        spotifyUserId: undefined,
        spotifyDisplayName: undefined,
        spotifyEmail: undefined,
        spotifyIsPremium: false,
        spotifyAccessToken: undefined,
        spotifyRefreshToken: undefined,
        spotifyTokenExpiresAt: undefined,
        spotifyScope: undefined,
        spotifyProduct: undefined,
        spotifyCountry: undefined
      });

      console.log(`🔐 Revoked Spotify authentication for user ${discordId}`);
    } catch (error: any) {
      throw new Error(`Failed to revoke user authentication: ${error.message}`);
    }
  }

  /**
   * Generate state parameter for OAuth CSRF protection
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate state parameter for OAuth CSRF protection
   */
  async validateState(state: string, discordId: string): Promise<boolean> {
    try {
      const session = await PrismaDatabase.getOAuthSession(state);
      return !!(session && session.discord_id === discordId && session.platform === 'SPOTIFY');
    } catch (error) {
      console.error('Error validating OAuth state:', error);
      return false;
    }
  }

  /**
   * Create OAuth session
   */
  async createOAuthSession(discordId: string): Promise<string> {
    const state = this.generateState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await PrismaDatabase.createOAuthSession({
      state,
      discordId,
      platform: 'SPOTIFY',
      expiresAt
    });

    return state;
  }

  /**
   * Test Spotify API connection with user token
   */
  async testConnection(accessToken: string): Promise<boolean> {
    try {
      this.spotifyApi.setAccessToken(accessToken);
      await this.spotifyApi.getMe();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default SpotifyAuthService;
