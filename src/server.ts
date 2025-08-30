import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'http';
import config from './config/environment';

// Import middleware
import rateLimiter from './middleware/rateLimiter';

// Import routes
import authRoutes, { setOAuthServer } from './routes/auth';
import walletRoutes from './routes/wallet';
import adminRoutes from './routes/admin';
import rewardsRoutes from './routes/rewards';
import withdrawalRoutes from './routes/withdrawals';
import webhookRoutes from './routes/webhooks';

// Import OAuth server
import OAuthServer from './services/oauthServer';

// Import services
import HeliusService from './services/helius';
import RewardsService from './services/rewards';

interface ApiError extends Error {
  status?: number;
}

class ApiServer {
  private app: Application;
  private server: Server | null = null;
  private port: number;
  private heliusService: HeliusService;
  private rewardsService: RewardsService;
  private oauthServer: OAuthServer;

  constructor() {
    this.app = express();
    this.port = config.api.port;
    this.heliusService = new HeliusService();
    this.rewardsService = new RewardsService();
    // OAuth server will be set by the bot when it starts
    this.oauthServer = null as any;
  }

  /**
   * Set the OAuth server from the bot
   */
  setOAuthServer(oauthServer: OAuthServer): void {
    this.oauthServer = oauthServer;
    console.log('🔗 OAuth server connected to API server');
  }

  /**
   * Initialize middleware
   */
  private initializeMiddleware(): void {
    // Trust proxy (required for nginx reverse proxy)
    this.app.set('trust proxy', 1);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false // Disable for API
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.api.corsOrigins.includes('*') ? '*' : config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'helius-signature']
    }));

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (config.api.nodeEnv !== 'test') {
      this.app.use(morgan('combined'));
    }

    // General rate limiting
    this.app.use(rateLimiter.general());
  }

  /**
   * Initialize routes
   */
  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Audius Crypto API is running',
        timestamp: new Date(),
        version: '1.0.0',
        environment: config.api.nodeEnv,
        solanaNetwork: config.solana.network
      });
    });

    // OAuth callback routes (what Spotify/Audius redirect to) are handled by authRoutes
    
    // OAuth processing routes (where auth routes redirect to)
    this.app.get('/oauth/spotify/callback', async (req: Request, res: Response) => {
      try {
        console.log('🔄 Processing Spotify OAuth callback:', req.query);
        
        const { code, state, error } = req.query;
        
        if (error) {
          return res.status(400).send(`
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
              <h2>❌ Spotify Authorization Failed</h2>
              <p>Error: ${error}</p>
              <p>You can close this window and try again in Discord.</p>
            </body></html>
          `);
        }

        // TODO: Connect to your existing OAuth server here
        // For now, show success message
        return res.send(`
          <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>✅ Spotify Authorization Successful!</h2>
            <p>Your Spotify account is now connected to Discord.</p>
            <p><strong>You can close this window and return to Discord.</strong></p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body></html>
        `);
        
      } catch (error) {
        console.error('Error processing Spotify OAuth:', error);
        return res.status(500).send(`
          <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Server Error</h2>
            <p>Please try again in Discord.</p>
          </body></html>
        `);
      }
    });

    this.app.get('/oauth/audius/callback', async (req: Request, res: Response) => {
      try {
        console.log('🔄 Processing Audius OAuth callback:', req.query);
        
        const { code, state, error } = req.query;
        
        if (error) {
          return res.status(400).send(`
            <html><body style="font-family: Arial; text-align: center; padding: 50px;">
              <h2>❌ Audius Authorization Failed</h2>
              <p>Error: ${error}</p>
              <p>You can close this window and try again in Discord.</p>
            </body></html>
          `);
        }

        // TODO: Connect to your existing OAuth server here
        return res.send(`
          <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>✅ Audius Authorization Successful!</h2>
            <p>Your Audius account is now connected to Discord.</p>
            <p><strong>You can close this window and return to Discord.</strong></p>
            <script>setTimeout(() => window.close(), 3000);</script>
          </body></html>
        `);
        
      } catch (error) {
        console.error('Error processing Audius OAuth:', error);
        return res.status(500).send(`
          <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Server Error</h2>
            <p>Please try again in Discord.</p>
          </body></html>
        `);
      }
    });

    // OAuth login initiation routes  
    this.app.get('/oauth/spotify/login/:sessionId', (req: Request, res: Response) => {
      try {
        const sessionId = req.params.sessionId;
        const spotifyAuthUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: config.spotify.clientId,
          scope: 'user-read-private user-read-email',
          redirect_uri: config.spotify.redirectUri,
          state: sessionId
        })}`;
        console.log(`🎵 Redirecting to Spotify OAuth for session: ${sessionId}`);
        res.redirect(spotifyAuthUrl);
      } catch (error) {
        console.error('OAuth login error:', error);
        res.status(500).json({ error: 'Failed to initiate OAuth' });
      }
    });

    this.app.get('/oauth/audius/login/:sessionId', (req: Request, res: Response) => {
      try {
        const sessionId = req.params.sessionId;
        
        // Use proper Audius OAuth URL format from their docs
        const audiusAuthUrl = `https://audius.co/oauth/auth?${new URLSearchParams({
          scope: 'read', // or 'write' for full permissions
          api_key: config.audius.apiKey || '',
          redirect_uri: 'https://volume.epiclootlabs.com/auth/audius/callback',
          state: sessionId,
          response_mode: 'query' // Use query params instead of fragment
        })}`;
        
        console.log(`🎵 Redirecting to Audius OAuth for session: ${sessionId}`);
        console.log(`🔗 Audius OAuth URL: ${audiusAuthUrl}`);
        res.redirect(audiusAuthUrl);
      } catch (error) {
        console.error('Audius OAuth login error:', error);
        res.status(500).json({ error: 'Failed to initiate Audius OAuth' });
      }
    });

    console.log('🔗 OAuth routes configured:');
    console.log('   Login: /oauth/spotify/login/:sessionId, /oauth/audius/login/:sessionId');
    console.log('   Callback: /auth/spotify/callback, /auth/audius/callback');

    // Auth routes (OAuth callbacks)
    this.app.use('/auth', authRoutes);
    
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/wallet', walletRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/rewards', rewardsRoutes);
    this.app.use('/api/withdrawals', withdrawalRoutes);
    this.app.use('/api/webhooks', webhookRoutes);

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: req.originalUrl
      });
    });
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: ApiError, req: Request, res: Response, next: NextFunction) => {
      console.error('Unhandled error:', error);

      // Don't leak error details in production
      const isDevelopment = config.api.nodeEnv === 'development';

      res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? error.message : 'Something went wrong',
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Initialize background services
   */
  private initializeServices(): void {
    try {
      // Initialize Helius WebSocket connection
      if (config.features.enableWebhooks) {
        this.heliusService.initWebSocket();
      }

      // Start automated settlement processing
      if (config.features.enableSettlement) {
        this.rewardsService.startAutomatedSettlement();
      }

      console.log('✅ Background services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize background services:', error);
    }
  }

  /**
   * Initialize the API server
   */
  private initialize(): void {
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeServices();
  }

  /**
   * Start the server
   */
  start(): void {
    this.initialize();

    this.server = this.app.listen(this.port, () => {
      console.log(`🚀 Audius Crypto API server running on port ${this.port}`);
      console.log(`📊 Environment: ${config.api.nodeEnv}`);
      console.log(`🔗 Solana Network: ${config.solana.network}`);
      console.log(`💰 Helius Integration: ${config.helius.apiKey ? 'Enabled' : 'Disabled'}`);
      console.log(`🎯 CORS Origins: ${config.api.corsOrigins.join(', ')}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down server...');

    if (this.server) {
      this.server.close();
    }

    try {
      // Close service connections
      await this.heliusService.disconnect();
      await this.rewardsService.disconnect();
      console.log('✅ Services disconnected successfully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }

    process.exit(0);
  }

  /**
   * Get the Express app instance (useful for testing)
   */
  getApp(): Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new ApiServer();
  server.start();
}

export default ApiServer;
