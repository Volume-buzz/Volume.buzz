/**
 * Main application entry point that starts both the Discord bot and API server
 */
import 'dotenv/config';
import AudiusBot from './bot';
import ApiServer from './server';

class AudiusApp {
  private bot: AudiusBot | null = null;
  private apiServer: ApiServer | null = null;

  /**
   * Start the complete application
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Audius Crypto Wallet System...');

      // Start API server first
      console.log('📡 Starting API server...');
      this.apiServer = new ApiServer();
      this.apiServer.start();

      // Start Discord bot
      console.log('🤖 Starting Discord bot...');
      this.bot = new AudiusBot();
      await this.bot.start();

      console.log('✅ Audius application started successfully!');
      console.log('🎵 Ready to process music raids with crypto rewards');
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      process.exit(1);
    }
  }

  /**
   * Shutdown the application gracefully
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Audius application...');

    try {
      if (this.bot) {
        await this.bot.shutdown();
      }

      if (this.apiServer) {
        await this.apiServer.shutdown();
      }

      console.log('✅ Application shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }

    process.exit(0);
  }
}

// Handle process signals for graceful shutdown
const app = new AudiusApp();

process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  app.shutdown();
});
process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  app.shutdown();
});

// Start the application
if (require.main === module) {
  app.start();
}

export default AudiusApp;
