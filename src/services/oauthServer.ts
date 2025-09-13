/**
 * OAuth Server
 * Handles authentication for Spotify platform
 */

import express, { Request, Response, Router } from 'express';
import { Server } from 'http';
import crypto from 'crypto';
import { User as DiscordUser } from 'discord.js';
import config from '../config/environment';
import PrismaDatabase from '../database/prisma';
import SpotifyAuthService from './spotify/SpotifyAuthService';
import WalletService from './wallet';

// Import types
import { Platform } from '../types/spotify';

interface OAuthCallbackRequest extends Request {
  query: {
    code?: string;
    state?: string;
    error?: string;
  };
}

class OAuthServer {
  private bot: any; // Reference to the main bot instance
  private spotifyAuthService: SpotifyAuthService;
  private walletService: WalletService;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(bot: any) {
    this.bot = bot;
    
    // Initialize services
    this.spotifyAuthService = new SpotifyAuthService({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: config.spotify.redirectUri
    });
    this.walletService = new WalletService();

    // Clean up expired sessions every 15 minutes (reduced frequency to avoid race conditions)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 15 * 60 * 1000);
  }

  // No need for separate middleware and routes - they'll be handled by the main API server

  /**
   * Clean up expired session mappings
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      console.log('🧹 Cleaning up expired OAuth sessions...');
      await PrismaDatabase.cleanupExpiredSessions();
      console.log('✅ OAuth session cleanup completed');
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }


  /**
   * Initiate Spotify OAuth flow
   */
  public async initiateSpotifyLogin(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Get Discord ID from session mapping
      const sessionData = await PrismaDatabase.getSessionMapping(sessionId);
      if (!sessionData || sessionData.platform !== 'SPOTIFY') {
        res.status(400).json({ error: 'Invalid or expired session ID' });
        return;
      }

      // Remove the temporary session mapping
      await PrismaDatabase.deleteSessionMapping(sessionId);
      
      // Generate CSRF state
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store OAuth session
      await PrismaDatabase.createOAuthSession({
        state,
        discordId: sessionData.discord_id,
        platform: 'SPOTIFY',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      });
      
      // Generate Spotify OAuth URL
      const authUrl = this.spotifyAuthService.generateAuthUrl(state);
      
      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating Spotify login:', error);
      res.status(500).json({ error: 'Failed to initiate Spotify login' });
    }
  }


  /**
   * Handle Spotify OAuth callback
   */
  public async handleSpotifyCallback(req: OAuthCallbackRequest, res: Response): Promise<void> {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error('Spotify OAuth error:', error);
        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Spotify Authentication Failed</h1>
              <p>Error: ${error}</p>
              <p>You can close this tab and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      if (!code || !state) {
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Invalid Request</h1>
              <p>Missing authorization code or state parameter.</p>
              <p>You can close this tab and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Get session to find Discord user
      console.log(`🔍 Looking up OAuth session for state: ${state.substring(0, 8)}...`);
      const session = await PrismaDatabase.getOAuthSession(state);
      
      if (!session) {
        console.error(`❌ OAuth session not found for state: ${state.substring(0, 8)}... - session may have expired or been cleaned up`);
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Invalid Session</h1>
              <p>OAuth session not found or expired. Please try again.</p>
              <p><small>If this continues happening, please contact support.</small></p>
            </body>
          </html>
        `);
        return;
      }

      if (session.platform !== 'SPOTIFY') {
        console.error(`❌ Wrong platform for session ${state.substring(0, 8)}...: expected SPOTIFY, got ${session.platform}`);
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Invalid Session</h1>
              <p>OAuth session platform mismatch. Please try again.</p>
            </body>
          </html>
        `);
        return;
      }

      console.log(`✅ Found valid OAuth session for Discord user: ${session.discord_id}`);

      // Check if session has expired
      if (session.expires_at && session.expires_at < new Date()) {
        await PrismaDatabase.deleteOAuthSession(state);
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Session Expired</h1>
              <p>OAuth session has expired. Please try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Exchange code for tokens
      const tokens = await this.spotifyAuthService.exchangeCodeForTokens(code);
      
      // Get user profile
      const userProfile = await this.spotifyAuthService.getUserProfile(tokens.access_token);
      
      // Get Discord user info
      const discordUser = await this.bot.client.users.fetch(session.discord_id);
      
      // Save tokens and user data with Discord username
      await this.spotifyAuthService.saveUserTokens(session.discord_id, tokens, userProfile, discordUser.username);
      
      // Create or get user's Solana wallet
      const isAdmin = await PrismaDatabase.isAdmin(session.discord_id);
      try {
        await this.walletService.createOrGetWallet(session.discord_id, isAdmin);
        console.log(`💳 Ensured Solana wallet exists for user ${session.discord_id}`);
      } catch (walletError) {
        console.warn('Failed to create wallet during Spotify login:', walletError);
      }
      
      // Send success DM to user
      try {
        if (this.bot && this.bot.client) {
          const discordUser = await this.bot.client.users.fetch(session.discord_id);
          await this.sendSpotifySuccessDM(discordUser, userProfile);
        } else {
          console.warn('Bot client not available for sending success DM');
        }
      } catch (dmError) {
        console.warn('Failed to send success DM:', dmError);
      }

      // Clean up OAuth session
      await PrismaDatabase.deleteOAuthSession(state);

      console.log(`✅ Spotify OAuth successful for user ${session.discord_id} (${userProfile.display_name}) - Premium: ${userProfile.product === 'premium'}`);

      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
            <div style="max-width: 500px; margin: 0 auto;">
              <div style="background: #1DB954; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                <h1 style="margin: 0;">🎶 Spotify Connected!</h1>
              </div>
              <h2>Welcome, ${userProfile.display_name}!</h2>
              <p>Your Spotify account has been successfully linked to Discord.</p>
              ${userProfile.product === 'premium' 
                ? '<p style="color: #1DB954; font-weight: bold;">🎉 Premium detected! You can participate in all raids with enhanced tracking.</p>'
                : '<p style="color: #FFD700;">ℹ️ Free account detected. You can participate in most raids, but some premium-only raids may be restricted.</p>'
              }
              <p>You can now close this tab and return to Discord to start raiding!</p>
              <script>
                setTimeout(() => {
                  window.close();
                }, 3000);
              </script>
            </div>
          </body>
        </html>
      `);

    } catch (error: any) {
      const errorMessage = error.message || error.toString() || 'Unknown error';
      console.error('Error handling Spotify callback:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
            <h1>❌ Server Error</h1>
            <p>An error occurred while processing your Spotify authentication.</p>
            <p>Error: ${errorMessage}</p>
            <p>Please try again later.</p>
          </body>
        </html>
      `);
    }
  }

  /**
   * Send success DM after Spotify authentication
   */
  private async sendSpotifySuccessDM(discordUser: DiscordUser, spotifyUser: any): Promise<void> {
    try {
      const isPremium = spotifyUser.product === 'premium';
      const isAdmin = await PrismaDatabase.isAdmin(discordUser.id);
      const wallet = await this.walletService.createOrGetWallet(discordUser.id, isAdmin);
      
      const embed = {
        title: '🎶 Spotify Account Connected!',
        description: `🎉 **Welcome to the Spotify Discord Bot!**\n\n` +
          `Your Spotify account has been successfully linked:\n` +
          `**🎵 ${spotifyUser.display_name}** ${isPremium ? '👑 (Premium)' : '🆓 (Free)'}\n\n` +
          `**💳 Solana Wallet Created**\n` +
          `Your crypto wallet: \`${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(-4)}\`\n` +
          `${isAdmin ? '👑 Admin wallet with full permissions' : '👤 Fan wallet with withdrawal limits'}\n\n` +
          `**What's next?**\n` +
          `🎯 Join music raids to earn tokens\n` +
          `🎧 Listen to tracks and get rewarded\n` +
          `🏆 Climb the leaderboard\n` +
          `💰 Use \`/wallet\` to view your balance\n\n` +
          `**Your Account Type:**\n` +
          `${isPremium 
            ? '👑 **Premium** - Access to all raids with enhanced embedded player tracking!\n' 
            : '🆓 **Free** - Access to most raids (some premium-only raids may be restricted)\n'
          }\n` +
          `**Available Commands:**\n` +
          `• \`/account\` - View your profile & tokens\n` +
          `• \`/wallet\` - View your Solana wallet & balances\n` +
          `• \`/withdraw\` - Cash out your tokens (1 SOL minimum)\n` +
          `${isAdmin ? '• `/deposit` - Deposit tokens for raid rewards\n• `/tokens` - Manage token configurations\n' : ''}` +
          `Ready to raid? 🚀`,
        color: 0x1DB954, // Spotify green
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Spotify Integration • Spotify Discord Bot'
        }
      };

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
      
      console.log(`📨 Sent Spotify OAuth success DM to ${discordUser.tag} (${spotifyUser.display_name}) - Premium: ${isPremium}`);
    } catch (error) {
      console.error('Failed to send Spotify OAuth success DM:', error);
    }
  }


  /**
   * Generate OAuth URLs for Discord commands
   */
  async generateAuthUrl(discordId: string, platform: Platform): Promise<string> {
    // Generate CSRF state for OAuth callback
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store OAuth session directly (this is what the callback expects)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes instead of 10
    await PrismaDatabase.createOAuthSession({
      state,
      discordId,
      platform,
      expiresAt
    });
    console.log(`🔐 Created OAuth session for Discord user ${discordId}, expires at ${expiresAt.toISOString()}`);
    
    // Generate Spotify OAuth URL using configured redirect URI
    const spotifyAuthUrl = this.spotifyAuthService.generateAuthUrl(state);
    return spotifyAuthUrl;
  }

  /**
   * Start the OAuth server (now just initializes, routes handled by main API server)
   */
  start(): void {
    console.log(`🔐 OAuth service initialized`);
    console.log(`🎶 Spotify callback: ${config.spotify.redirectUri}`);
  }

  /**
   * Stop the OAuth server and clean up resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('🔐 OAuth service stopped');
  }

  /**
   * Get Spotify auth service instance
   */
  getSpotifyAuthService(): SpotifyAuthService {
    return this.spotifyAuthService;
  }
}

export default OAuthServer;
