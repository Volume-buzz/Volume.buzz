/**
 * Enhanced OAuth Server
 * Handles authentication for both Audius and Spotify platforms
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

  constructor(bot: any) {
    this.bot = bot;
    
    // Initialize services
    this.spotifyAuthService = new SpotifyAuthService({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: config.spotify.redirectUri
    });
    this.walletService = new WalletService();

    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  // No need for separate middleware and routes - they'll be handled by the main API server

  /**
   * Clean up expired session mappings
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      await PrismaDatabase.cleanupExpiredSessions();
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
    }
  }

  /**
   * Initiate Audius OAuth flow
   */
  public async initiateAudiusLogin(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ error: 'Session ID is required' });
        return;
      }

      // Get Discord ID from session mapping
      const sessionData = await PrismaDatabase.getSessionMapping(sessionId);
      if (!sessionData || sessionData.platform !== 'AUDIUS') {
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
        platform: 'AUDIUS',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      // Create Audius OAuth URL (you'll need to implement this based on your existing Audius OAuth)
      const audiusCallbackUrl = config.spotify.redirectUri.replace('/auth/spotify/callback', '/auth/audius/callback');
      const authUrl = `https://audius.co/oauth/auth?client_id=${config.audius.apiKey}&response_type=code&redirect_uri=${encodeURIComponent(audiusCallbackUrl)}&state=${state}&scope=read`;
      
      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating Audius login:', error);
      res.status(500).json({ error: 'Failed to initiate Audius login' });
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
      
      // Create OAuth session
      const state = await this.spotifyAuthService.createOAuthSession(sessionData.discord_id);
      
      // Generate Spotify OAuth URL
      const authUrl = this.spotifyAuthService.generateAuthUrl(state);
      
      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating Spotify login:', error);
      res.status(500).json({ error: 'Failed to initiate Spotify login' });
    }
  }

  /**
   * Handle Audius OAuth callback
   */
  public async handleAudiusCallback(req: OAuthCallbackRequest, res: Response): Promise<void> {
    try {
      const { code, state, error } = req.query;

      if (error) {
        console.error('Audius OAuth error:', error);
        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Audius Authentication Failed</h1>
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
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Invalid Request</h1>
              <p>Missing authorization code or state parameter.</p>
              <p>You can close this tab and try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // Validate OAuth session
      const session = await PrismaDatabase.getOAuthSession(state);
      
      if (!session || session.platform !== 'AUDIUS') {
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>❌ Invalid Session</h1>
              <p>OAuth session not found or expired. Please try again.</p>
            </body>
          </html>
        `);
        return;
      }

      // TODO: Implement actual Audius OAuth token exchange
      // For now, this is a placeholder - you'll need to implement based on your existing Audius OAuth
      console.log('🔄 Processing Audius OAuth callback...');
      
      // Create or get user's Solana wallet
      const isAdmin = await PrismaDatabase.isAdmin(session.discord_id);
      try {
        await this.walletService.createOrGetWallet(session.discord_id, isAdmin);
        console.log(`💳 Ensured Solana wallet exists for user ${session.discord_id}`);
      } catch (walletError) {
        console.warn('Failed to create wallet during Audius login:', walletError);
      }
      
      // Send success DM to user
      try {
        if (this.bot && this.bot.client) {
          const discordUser = await this.bot.client.users.fetch(session.discord_id);
          await this.sendAudiusSuccessDM(discordUser);
        } else {
          console.warn('Bot client not available for sending Audius success DM');
        }
      } catch (dmError) {
        console.warn('Failed to send Audius success DM:', dmError);
      }
      
      // Clean up OAuth session
      await PrismaDatabase.deleteOAuthSession(state);

      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>✅ Audius Authentication Successful!</h1>
            <p>Your Audius account has been linked to Discord.</p>
            <p>You can now close this tab and return to Discord.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error handling Audius callback:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Server Error</h1>
            <p>An error occurred while processing your authentication.</p>
            <p>Please try again later.</p>
          </body>
        </html>
      `);
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
      const session = await PrismaDatabase.getOAuthSession(state);
      if (!session || session.platform !== 'SPOTIFY') {
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>❌ Invalid Session</h1>
              <p>OAuth session not found or expired. Please try again.</p>
            </body>
          </html>
        `);
        return;
      }

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
      
      // Save tokens and user data
      await this.spotifyAuthService.saveUserTokens(session.discord_id, tokens, userProfile);
      
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
      console.error('Error handling Spotify callback:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
            <h1>❌ Server Error</h1>
            <p>An error occurred while processing your Spotify authentication.</p>
            <p>Error: ${error.message}</p>
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
        description: `🎉 **Welcome to the Audius Discord Bot!**\n\n` +
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
          text: 'Spotify Integration • Audius Discord Bot'
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
   * Send success DM after Audius authentication
   */
  private async sendAudiusSuccessDM(discordUser: DiscordUser): Promise<void> {
    try {
      const isAdmin = await PrismaDatabase.isAdmin(discordUser.id);
      const wallet = await this.walletService.createOrGetWallet(discordUser.id, isAdmin);
      
      const embed = {
        title: '🎵 Audius Account Connected!',
        description: `🎉 **Welcome to the Audius Discord Bot!**\n\n` +
          `Your Audius account has been successfully linked!\n\n` +
          `**💳 Solana Wallet Created**\n` +
          `Your crypto wallet: \`${wallet.publicKey.substring(0, 8)}...${wallet.publicKey.substring(-4)}\`\n` +
          `${isAdmin ? '👑 Admin wallet with full permissions' : '👤 Fan wallet with withdrawal limits'}\n\n` +
          `**What's next?**\n` +
          `🎯 Join music raids to earn tokens\n` +
          `🎧 Listen to tracks and get rewarded\n` +
          `🏆 Climb the leaderboard\n` +
          `💰 Use \`/wallet\` to view your balance\n\n` +
          `**Available Commands:**\n` +
          `• \`/account\` - View your profile & tokens\n` +
          `• \`/wallet\` - View your Solana wallet & balances\n` +
          `• \`/withdraw\` - Cash out your tokens (1 SOL minimum)\n` +
          `${isAdmin ? '• `/deposit` - View wallet address for deposits\n• `/tokens` - Manage token configurations\n' : ''}` +
          `Ready to raid? 🚀`,
        color: 0x8B5DFF, // Purple for Audius
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Audius Integration • Audius Discord Bot'
        }
      };

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
      
      console.log(`📨 Sent Audius OAuth success DM to ${discordUser.tag}`);
    } catch (error) {
      console.error('Failed to send Audius OAuth success DM:', error);
    }
  }

  /**
   * Generate OAuth URLs for Discord commands
   */
  async generateAuthUrl(discordId: string, platform: Platform): Promise<string> {
    const baseUrl = config.api.nodeEnv === 'production' 
      ? 'https://volume.epiclootlabs.com' 
      : `http://localhost:${config.api.port}`;
    
    // Generate random session ID instead of using Discord ID
    const randomSessionId = crypto.randomBytes(16).toString('hex');
    
    // Store mapping in database with 10 minute expiration
    await PrismaDatabase.createSessionMapping({
      sessionId: randomSessionId,
      discordId,
      platform,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    
    if (platform === 'SPOTIFY') {
      return `${baseUrl}/oauth/spotify/login/${randomSessionId}`;
    } else {
      return `${baseUrl}/oauth/audius/login/${randomSessionId}`;
    }
  }

  /**
   * Start the OAuth server (now just initializes, routes handled by main API server)
   */
  start(): void {
    console.log(`🔐 OAuth service initialized`);
    console.log(`🎵 Audius callback: https://volume.epiclootlabs.com/auth/audius/callback`);
    console.log(`🎶 Spotify callback: https://volume.epiclootlabs.com/auth/spotify/callback`);
  }

  /**
   * Stop the OAuth server
   */
  stop(): void {
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
