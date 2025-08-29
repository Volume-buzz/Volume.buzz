/**
 * Helius service for Solana blockchain integration
 */

class HeliusService {
  constructor() {
    console.log('🔗 HeliusService initialized');
  }

  async initWebSocket(): Promise<void> {
    console.log('🔌 HeliusService WebSocket initialized');
  }

  async disconnect(): Promise<void> {
    console.log('🔌 HeliusService disconnected');
  }
}

export default HeliusService;
