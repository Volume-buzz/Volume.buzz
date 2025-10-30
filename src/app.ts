/**
 * Main application entry point that starts both the Discord bot and API server
 */

// IMPORTANT: Import Sentry instrumentation first, before any other imports
require('../instrument');

import 'dotenv/config';
import * as Sentry from '@sentry/node';
import SpotifyBot from './bot';
import ApiServer from './server';
import logger, { createLogger } from './utils/logger';

class SpotifyApp {
  private bot: SpotifyBot | null = null;
  private apiServer: ApiServer | null = null;
  private logger = createLogger('SpotifyApp');

  /**
   * Start the complete application
   */
  async start(): Promise<void> {
    return Sentry.startSpan(
      { 
        op: "app.startup",
        name: "Application Startup",
        attributes: {
          environment: process.env.NODE_ENV || 'development'
        }
      },
      async () => {
        try {
          this.logger.info('Starting Spotify Crypto Wallet System', { 
            environment: process.env.NODE_ENV,
            startup: true 
          });

          // Start API server first
          await Sentry.startSpan(
            { op: "app.server.start", name: "Start API Server" },
            async () => {
              this.logger.info('Starting API server', { component: 'api_server' });
              this.apiServer = new ApiServer();
              await this.apiServer.start();
            }
          );

          // Start Discord bot
          await Sentry.startSpan(
            { op: "app.bot.start", name: "Start Discord Bot" },
            async () => {
              this.logger.info('Starting Discord bot', { component: 'discord_bot' });
              this.bot = new SpotifyBot();
              await this.bot.start();
            }
          );

          // Connect OAuth server, Discord client, and Party Poster to API server
          this.apiServer!.setOAuthServer(this.bot!.getOAuthServer());
          this.apiServer!.setDiscordClient(this.bot!.client);
          this.apiServer!.setPartyPoster(this.bot!.partyPoster);
          this.logger.info('OAuth, DM, and Party Poster services connected', {
            oauth_connected: true,
            dm_service_connected: true,
            party_poster_connected: true
          });

          this.logger.info('Spotify application started successfully', { 
            startup_complete: true,
            services: ['discord_bot', 'api_server', 'oauth_service', 'dm_service']
          });
          this.logger.info('Ready to process music raids with crypto rewards', { ready: true });
        } catch (error) {
          this.logger.error('Failed to start application', error as Error, { startup_error: true });
          Sentry.captureException(error, {
            tags: {
              component: 'app_startup'
            },
            extra: {
              startup_phase: 'main_application_start'
            }
          });
          process.exit(1);
        }
      }
    );
  }

  /**
   * Shutdown the application gracefully
   */
  async shutdown(): Promise<void> {
    return Sentry.startSpan(
      { op: "app.shutdown", name: "Application Shutdown" },
      async () => {
        this.logger.info('Shutting down Spotify application', { shutdown: true });

        try {
          if (this.bot) {
            this.logger.info('Shutting down Discord bot', { component: 'discord_bot' });
            await this.bot.shutdown();
          }

          if (this.apiServer) {
            this.logger.info('Shutting down API server', { component: 'api_server' });
            await this.apiServer.shutdown();
          }

          this.logger.info('Application shutdown complete', { shutdown_complete: true });
          
          // Close Sentry client and flush any pending data
          await Sentry.close(2000);
        } catch (error) {
          this.logger.error('Error during shutdown', error as Error, { shutdown_error: true });
          Sentry.captureException(error, {
            tags: { component: 'app_shutdown' }
          });
        }

        process.exit(0);
      }
    );
  }
}

// Handle process signals for graceful shutdown
const app = new SpotifyApp();

process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());
// Create logger for global error handlers
const globalLogger = createLogger('GlobalErrorHandler');

process.on('uncaughtException', (error: Error) => {
  globalLogger.fatal('Uncaught Exception', error, { error_type: 'uncaught_exception' });
  Sentry.captureException(error, {
    tags: { 
      error_type: 'uncaught_exception',
      component: 'global_error_handler' 
    }
  });
  app.shutdown();
});
process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  globalLogger.fatal('Unhandled Rejection', reason as Error, { 
    error_type: 'unhandled_rejection',
    promise: promise.toString()
  });
  Sentry.captureException(reason as Error, {
    tags: { 
      error_type: 'unhandled_rejection',
      component: 'global_error_handler'
    },
    extra: { promise: promise.toString() }
  });
  app.shutdown();
});

// Start the application
if (require.main === module) {
  app.start();
}

export default SpotifyApp;
