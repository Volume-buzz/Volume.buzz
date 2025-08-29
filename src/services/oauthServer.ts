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
  private app: express.Application;
  private server: Server | null = null;
  private bot: any; // Reference to the main bot instance
  private spotifyAuthService: SpotifyAuthService;
  private router: Router;

  constructor(bot: any) {
    this.bot = bot;
    this.app = express();
    this.router = Router();
    
    // Initialize Spotify auth service
    this.spotifyAuthService = new SpotifyAuthService({
      clientId: config.spotify.clientId,
      clientSecret: config.spotify.clientSecret,
      redirectUri: config.spotify.redirectUri
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for OAuth callbacks
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  private setupRoutes(): void {
    // Audius OAuth callback (existing)
    this.router.get('/oauth/audius/callback', this.handleAudiusCallback.bind(this));
    
    // Spotify OAuth callback (new)
    this.router.get('/oauth/spotify/callback', this.handleSpotifyCallback.bind(this));
    
    // OAuth initiation endpoints
    this.router.get('/oauth/audius/login/:discordId', this.initiateAudiusLogin.bind(this));
    this.router.get('/oauth/spotify/login/:discordId', this.initiateSpotifyLogin.bind(this));
    
    // Health check
    this.router.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        service: 'oauth-server',
        platforms: ['audius', 'spotify'],
        timestamp: new Date().toISOString() 
      });
    });

    this.app.use('/', this.router);
  }

  /**
   * Initiate Audius OAuth flow
   */
  private async initiateAudiusLogin(req: Request, res: Response): Promise<void> {
    try {
      const { discordId } = req.params;
      
      if (!discordId) {
        res.status(400).json({ error: 'Discord ID is required' });
        return;
      }

      // Generate CSRF state
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store OAuth session
      await PrismaDatabase.createOAuthSession({
        state,
        discordId,
        platform: 'AUDIUS',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      // Create Audius OAuth URL (you'll need to implement this based on your existing Audius OAuth)
      const authUrl = `https://audius.co/oauth/auth?client_id=${config.audius.apiKey}&response_type=code&redirect_uri=${encodeURIComponent(config.spotify.redirectUri.replace('spotify', 'audius'))}&state=${state}&scope=read`;
      
      res.redirect(authUrl);
    } catch (error: any) {
      console.error('Error initiating Audius login:', error);
      res.status(500).json({ error: 'Failed to initiate Audius login' });
    }
  }

  /**
   * Initiate Spotify OAuth flow
   */
  private async initiateSpotifyLogin(req: Request, res: Response): Promise<void> {
    try {
      const { discordId } = req.params;
      
      if (!discordId) {
        res.status(400).json({ error: 'Discord ID is required' });
        return;
      }

      // Create OAuth session
      const state = await this.spotifyAuthService.createOAuthSession(discordId);
      
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
  private async handleAudiusCallback(req: OAuthCallbackRequest, res: Response): Promise<void> {
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
  private async handleSpotifyCallback(req: OAuthCallbackRequest, res: Response): Promise<void> {
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

      // Validate OAuth session
      const isValid = await this.spotifyAuthService.validateState(state, ''); // We'll get discordId from session
      
      if (!isValid) {
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

      // Get session to find Discord user
      const session = await PrismaDatabase.getOAuthSession(state);
      if (!session) {
        throw new Error('Session not found after validation');
      }

      // Exchange code for tokens
      const tokens = await this.spotifyAuthService.exchangeCodeForTokens(code);
      
      // Get user profile
      const userProfile = await this.spotifyAuthService.getUserProfile(tokens.access_token);
      
      // Save tokens and user data
      await this.spotifyAuthService.saveUserTokens(session.discord_id, tokens, userProfile);
      
      // Send success DM to user
      try {
        const discordUser = await this.bot.client.users.fetch(session.discord_id);
        await this.sendSpotifySuccessDM(discordUser, userProfile);
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
      
      const embed = {
        title: '🎶 Spotify Account Connected!',
        description: `🎉 **Welcome to the Audius Discord Bot!**\n\n` +
          `Your Spotify account has been successfully linked:\n` +
          `**🎵 ${spotifyUser.display_name}** ${isPremium ? '👑 (Premium)' : '🆓 (Free)'}\n\n` +
          `**What's next?**\n` +
          `🎯 Join music raids to earn tokens\n` +
          `🎧 Listen to tracks and get rewarded\n` +
          `🏆 Climb the leaderboard\n\n` +
          `**Your Account Type:**\n` +
          `${isPremium 
            ? '👑 **Premium** - Access to all raids with enhanced embedded player tracking!\n' 
            : '🆓 **Free** - Access to most raids (some premium-only raids may be restricted)\n'
          }\n` +
          `**Available Commands:**\n` +
          `• \`/account\` - View your profile & tokens\n` +
          `• \`/leaderboard\` - See top raiders\n` +
          `• \`/search\` - Find tracks for raids\n\n` +
          `Ready to raid? 🚀`,
        color: 0x1DB954, // Spotify green
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Spotify Integration • Audius Discord Bot'
        }
      };

      const dmChannel = await discordUser.createDM();
      await dmChannel.send({ embeds: [embed] });
      
      console.log(`📨 Sent Spotify OAuth success DM to ${discordUser.tag} (${spotifyUser.display_name})`);
    } catch (error) {
      console.error('Failed to send Spotify OAuth success DM:', error);
    }
  }

  /**
   * Generate OAuth URLs for Discord commands
   */
  generateAuthUrl(discordId: string, platform: Platform): string {
    const baseUrl = `http://localhost:${config.api.port}`;
    
    if (platform === 'SPOTIFY') {
      return `${baseUrl}/oauth/spotify/login/${discordId}`;
    } else {
      return `${baseUrl}/oauth/audius/login/${discordId}`;
    }
  }

  /**
   * Start the OAuth server
   */
  start(): void {
    const port = config.api.port;
    
    this.server = this.app.listen(port, () => {
      console.log(`🔐 OAuth server running on port ${port}`);
      console.log(`🎵 Audius callback: http://localhost:${port}/oauth/audius/callback`);
      console.log(`🎶 Spotify callback: http://localhost:${port}/oauth/spotify/callback`);
    });
  }

  /**
   * Stop the OAuth server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('🔐 OAuth server stopped');
    }
  }

  /**
   * Get Spotify auth service instance
   */
  getSpotifyAuthService(): SpotifyAuthService {
    return this.spotifyAuthService;
  }
}

export default OAuthServer;
