/**
 * Cached database operations for performance optimization
 */

import PrismaDatabase from '../database/prisma';
import cacheService, { CacheKeys, CacheTTL } from './cache';

export class CachedDatabase {
  /**
   * Get active raids with caching
   */
  static async getActiveRaids() {
    return cacheService.getOrSet(
      CacheKeys.ACTIVE_RAIDS,
      () => PrismaDatabase.getActiveRaids(),
      CacheTTL.SHORT // 1 minute - raids change frequently
    );
  }

  /**
   * Get raid by ID with caching
   */
  static async getRaid(raidId: string) {
    return cacheService.getOrSet(
      CacheKeys.RAID_BY_ID(raidId),
      () => PrismaDatabase.getRaid(raidId),
      CacheTTL.MEDIUM // 5 minutes - individual raids change less frequently
    );
  }

  /**
   * Get user by Discord ID with caching
   */
  static async getUserByDiscordId(discordId: string) {
    return cacheService.getOrSet(
      CacheKeys.USER_BY_DISCORD_ID(discordId),
      () => PrismaDatabase.getUser(discordId),
      CacheTTL.MEDIUM // 5 minutes - user data changes moderately
    );
  }

  /**
   * Get user wallet with caching
   */
  static async getUserWallet(discordId: string) {
    return cacheService.getOrSet(
      CacheKeys.USER_WALLET(discordId),
      () => PrismaDatabase.getUserWallet(discordId),
      CacheTTL.LONG // 1 hour - wallet data changes rarely
    );
  }

  /**
   * Get tokens list with caching
   */
  static async getTokens() {
    return cacheService.getOrSet(
      CacheKeys.TOKENS_LIST,
      () => PrismaDatabase.getAllEnabledTokens(),
      CacheTTL.VERY_LONG // 24 hours - token metadata rarely changes
    );
  }

  /**
   * Get token by mint address with caching
   */
  static async getTokenByMint(mint: string) {
    return cacheService.getOrSet(
      CacheKeys.TOKEN_BY_MINT(mint),
      () => PrismaDatabase.getTokenByMint(mint),
      CacheTTL.VERY_LONG // 24 hours - token metadata rarely changes
    );
  }

  /**
   * Get leaderboard with caching
   */
  static async getLeaderboard(limit = 10) {
    return cacheService.getOrSet(
      CacheKeys.LEADERBOARD_TOP,
      () => PrismaDatabase.getLeaderboard(limit),
      CacheTTL.MEDIUM // 5 minutes - leaderboard changes moderately
    );
  }

  /**
   * Invalidate cache for specific keys
   */
  static async invalidateCache(patterns: string[]) {
    for (const pattern of patterns) {
      await cacheService.clearPattern(pattern);
    }
  }

  /**
   * Invalidate user-related cache
   */
  static async invalidateUserCache(discordId: string) {
    await Promise.all([
      cacheService.del(CacheKeys.USER_BY_DISCORD_ID(discordId)),
      cacheService.del(CacheKeys.USER_WALLET(discordId)),
      cacheService.del(CacheKeys.SPOTIFY_DEVICES(discordId)),
      cacheService.del(CacheKeys.SPOTIFY_TOKEN(discordId)),
      // Also clear leaderboard as user data might affect it
      cacheService.del(CacheKeys.LEADERBOARD_TOP)
    ]);
  }

  /**
   * Invalidate raid-related cache
   */
  static async invalidateRaidCache(raidId?: string) {
    await Promise.all([
      cacheService.del(CacheKeys.ACTIVE_RAIDS),
      raidId ? cacheService.del(CacheKeys.RAID_BY_ID(raidId)) : Promise.resolve()
    ]);
  }

  /**
   * Warm up frequently accessed cache
   */
  static async warmUpCache() {
    try {
      console.log('🔥 Warming up cache...');
      
      // Pre-load frequently accessed data
      await Promise.all([
        this.getActiveRaids(),
        this.getTokens(),
        this.getLeaderboard()
      ]);

      console.log('✅ Cache warmed up successfully');
    } catch (error) {
      console.error('❌ Cache warm-up failed:', error);
    }
  }
}

export default CachedDatabase;