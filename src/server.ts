import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Server } from 'http';
import config from './config/environment';

// Import middleware
import rateLimiter from './middleware/rateLimiter';

// Import routes
import authRoutes, { setOAuthServer, setDMService } from './routes/auth';
import walletRoutes from './routes/wallet';
import usersRoutes from './routes/users';
import raidsRoutes from './routes/raids';
import adminRoutes from './routes/admin';
import rewardsRoutes from './routes/rewards';
import withdrawalRoutes from './routes/withdrawals';
import webhookRoutes from './routes/webhooks';
import spotifyRoutes from './routes/spotify';

// Import OAuth server
import OAuthServer from './services/oauthServer';

// Import services
import HeliusService from './services/helius';
import RewardsService from './services/rewards';
import DMService from './services/dmService';

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
  private dmService: DMService;

  constructor() {
    this.app = express();
    this.port = config.api.port;
    this.heliusService = new HeliusService();
    this.rewardsService = new RewardsService();
    this.dmService = new DMService();
    // OAuth server will be set by the bot when it starts
    this.oauthServer = null as any;
  }

  /**
   * Set the OAuth server from the bot
   */
  setOAuthServer(oauthServer: OAuthServer): void {
    this.oauthServer = oauthServer;
    setOAuthServer(oauthServer);
    console.log('🔗 OAuth server connected to API server');
  }

  /**
   * Set the Discord client for DM service
   */
  setDiscordClient(client: any): void {
    this.dmService.setClient(client);
    setDMService(this.dmService);
    console.log('🤖 Discord client connected to DM service');
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
      // If '*' is present, reflect the request origin (works with credentials)
      origin: config.api.corsOrigins.includes('*') ? true : config.api.corsOrigins,
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
        message: 'Spotify Crypto API is running',
        timestamp: new Date(),
        version: '1.0.0',
        environment: config.api.nodeEnv,
        solanaNetwork: config.solana.network
      });
    });

    // OAuth callbacks are handled by authRoutes only

    // OAuth login routes (redirect to providers)
    this.app.get('/oauth/spotify/login/:sessionId', (req, res) => {
      if (this.oauthServer) {
        this.oauthServer.initiateSpotifyLogin(req, res);
      } else {
        res.status(500).json({ error: 'OAuth server not initialized' });
      }
    });
    

    // Auth routes (OAuth callbacks)
    this.app.use('/auth', authRoutes);
    
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/wallet', walletRoutes);
    this.app.use('/api/users', usersRoutes);
    this.app.use('/api/raids', raidsRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/rewards', rewardsRoutes);
    this.app.use('/api/withdrawals', withdrawalRoutes);
    this.app.use('/api/spotify', spotifyRoutes);
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
      console.log(`🚀 Spotify Crypto API server running on port ${this.port}`);
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
