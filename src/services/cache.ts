/**
 * Redis caching service for frequently accessed data
 */

import { createClient, RedisClientType } from 'redis';
import config from '../config/environment';

class CacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    // Only use Redis in production or when REDIS_URL is available
    if (config.api.nodeEnv === 'production' && process.env.REDIS_URL) {
      try {
        this.client = createClient({
          url: process.env.REDIS_URL
        });

        this.client.on('error', (err: Error) => {
          console.error('Redis Cache Client Error:', err);
          this.isConnected = false;
        });

        this.client.on('connect', () => {
          console.log('✅ Cache service connected to Redis');
          this.isConnected = true;
        });

        await this.client.connect();
      } catch (error) {
        console.error('Failed to initialize Redis cache:', error);
        this.client = null;
      }
    } else {
      console.log('📦 Cache service running in memory mode (development)');
    }
  }

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.client || !this.isConnected) {
        return null;
      }

      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set cached data with optional expiration
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      if (!this.client || !this.isConnected) {
        return;
      }

      const serialized = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Delete cached data
   */
  async del(key: string): Promise<void> {
    try {
      if (!this.client || !this.isConnected) {
        return;
      }

      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  /**
   * Clear cache by pattern (use with caution)
   */
  async clearPattern(pattern: string): Promise<void> {
    try {
      if (!this.client || !this.isConnected) {
        return;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache clear pattern error:', error);
    }
  }

  /**
   * Get or set cached data with a fallback function
   */
  async getOrSet<T>(
    key: string, 
    fallback: () => Promise<T>, 
    ttlSeconds?: number
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      const data = await fallback();
      await this.set(key, data, ttlSeconds);
      return data;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      // Fallback to direct call if cache fails
      return await fallback();
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
        console.log('🔌 Cache service disconnected');
      }
    } catch (error) {
      console.error('Cache disconnect error:', error);
    }
  }

  /**
   * Get cache service status
   */
  getStatus(): { connected: boolean; mode: string } {
    return {
      connected: this.isConnected,
      mode: this.client ? 'redis' : 'memory'
    };
  }
}

// Singleton instance
const cacheService = new CacheService();
export default cacheService;

// Cache key generators for consistency
export const CacheKeys = {
  // Tokens metadata (rarely changes)
  TOKENS_LIST: 'tokens:list',
  TOKEN_BY_MINT: (mint: string) => `token:${mint}`,

  // Active raids (changes frequently, short TTL)
  ACTIVE_RAIDS: 'raids:active',
  RAID_BY_ID: (id: string) => `raid:${id}`,

  // User data (medium TTL)
  USER_BY_DISCORD_ID: (discordId: string) => `user:discord:${discordId}`,
  USER_WALLET: (discordId: string) => `wallet:user:${discordId}`,

  // Public leaderboards (medium TTL)
  LEADERBOARD_TOP: 'leaderboard:top:10',

  // Spotify data (short TTL due to frequent changes)
  SPOTIFY_DEVICES: (discordId: string) => `spotify:devices:${discordId}`,
  SPOTIFY_TOKEN: (discordId: string) => `spotify:token:${discordId}`,
} as const;

// Cache TTL constants (in seconds)
export const CacheTTL = {
  SHORT: 60,        // 1 minute - frequently changing data
  MEDIUM: 300,      // 5 minutes - moderately changing data  
  LONG: 3600,       // 1 hour - rarely changing data
  VERY_LONG: 86400, // 24 hours - static/configuration data
} as const;