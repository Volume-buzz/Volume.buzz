/**
 * Spotify Rate Limiting Service
 * Handles rate limiting, backoff, and retry logic for Spotify API calls
 */

import { SpotifyRateLimitInfo } from '../../types/spotify';

interface RateLimitState {
  retryAfter?: number;
  retryAfterExpires?: number;
  requestCount: number;
  windowStart: number;
  lastRequest: number;
}

class SpotifyRateLimitService {
  private static instance: SpotifyRateLimitService;
  private rateLimitState: Map<string, RateLimitState> = new Map();
  private readonly WINDOW_SIZE_MS = 30 * 1000; // 30 second rolling window
  private readonly MAX_REQUESTS_PER_WINDOW = 100; // Conservative limit for development mode
  private readonly MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests

  static getInstance(): SpotifyRateLimitService {
    if (!SpotifyRateLimitService.instance) {
      SpotifyRateLimitService.instance = new SpotifyRateLimitService();
    }
    return SpotifyRateLimitService.instance;
  }

  /**
   * Check if we can make a request for a specific endpoint/user combination
   */
  async canMakeRequest(key: string): Promise<{ canProceed: boolean; waitTime?: number }> {
    const now = Date.now();
    const state = this.rateLimitState.get(key) || {
      requestCount: 0,
      windowStart: now,
      lastRequest: 0
    };

    // Check if we're in a retry-after period
    if (state.retryAfter && state.retryAfterExpires && now < state.retryAfterExpires) {
      const waitTime = Math.ceil((state.retryAfterExpires - now) / 1000);
      return { canProceed: false, waitTime };
    }

    // Reset window if it has expired
    if (now - state.windowStart >= this.WINDOW_SIZE_MS) {
      state.requestCount = 0;
      state.windowStart = now;
    }

    // Check if we've exceeded the rate limit
    if (state.requestCount >= this.MAX_REQUESTS_PER_WINDOW) {
      const waitTime = Math.ceil((this.WINDOW_SIZE_MS - (now - state.windowStart)) / 1000);
      return { canProceed: false, waitTime };
    }

    // Check minimum interval between requests
    if (now - state.lastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = Math.ceil((this.MIN_REQUEST_INTERVAL - (now - state.lastRequest)) / 1000);
      return { canProceed: false, waitTime };
    }

    return { canProceed: true };
  }

  /**
   * Record a successful request
   */
  recordRequest(key: string): void {
    const now = Date.now();
    const state = this.rateLimitState.get(key) || {
      requestCount: 0,
      windowStart: now,
      lastRequest: 0
    };

    state.requestCount++;
    state.lastRequest = now;
    
    // Clear any retry-after state on successful request
    state.retryAfter = undefined;
    state.retryAfterExpires = undefined;

    this.rateLimitState.set(key, state);
  }

  /**
   * Record a rate limit response
   */
  recordRateLimit(key: string, retryAfter: number): void {
    const now = Date.now();
    const state = this.rateLimitState.get(key) || {
      requestCount: 0,
      windowStart: now,
      lastRequest: now
    };

    state.retryAfter = retryAfter;
    state.retryAfterExpires = now + (retryAfter * 1000);

    this.rateLimitState.set(key, state);
    
    console.log(`⏱️ Rate limited for key ${key}, retry after ${retryAfter}s`);
  }

  /**
   * Execute a Spotify API call with automatic rate limiting and retries
   */
  async executeWithRateLimit<T>(
    key: string,
    apiCall: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let retries = 0;
    
    while (retries <= maxRetries) {
      // Check if we can make the request
      const { canProceed, waitTime } = await this.canMakeRequest(key);
      
      if (!canProceed && waitTime) {
        if (retries === maxRetries) {
          throw new Error(`Rate limited. Please try again in ${waitTime} seconds.`);
        }
        
        console.log(`⏱️ Rate limited, waiting ${waitTime}s before retry ${retries + 1}/${maxRetries}`);
        await this.sleep(waitTime * 1000);
        retries++;
        continue;
      }

      try {
        // Execute the API call
        const result = await apiCall();
        
        // Record successful request
        this.recordRequest(key);
        
        return result;
      } catch (error: any) {
        // Handle rate limiting response
        if (error.statusCode === 429) {
          const retryAfter = parseInt(error.headers?.['retry-after'] || '30');
          this.recordRateLimit(key, retryAfter);
          
          if (retries === maxRetries) {
            throw new Error(`Rate limited after ${maxRetries} retries. Please try again in ${retryAfter} seconds.`);
          }
          
          console.log(`⏱️ Got 429 response, waiting ${retryAfter}s before retry ${retries + 1}/${maxRetries}`);
          await this.sleep(retryAfter * 1000);
          retries++;
          continue;
        }

        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }

    throw new Error(`Max retries (${maxRetries}) exceeded`);
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit stats for debugging
   */
  getRateLimitStats(): { [key: string]: RateLimitState } {
    const stats: { [key: string]: RateLimitState } = {};
    for (const [key, state] of this.rateLimitState.entries()) {
      stats[key] = { ...state };
    }
    return stats;
  }

  /**
   * Clear rate limit state for a specific key
   */
  clearRateLimit(key: string): void {
    this.rateLimitState.delete(key);
  }

  /**
   * Generate rate limit key for user-specific endpoints
   */
  static getUserKey(discordId: string, endpoint: string): string {
    return `user:${discordId}:${endpoint}`;
  }

  /**
   * Generate rate limit key for global endpoints
   */
  static getGlobalKey(endpoint: string): string {
    return `global:${endpoint}`;
  }
}

export default SpotifyRateLimitService;

