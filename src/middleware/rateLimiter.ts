/**
 * Rate limiting middleware for API endpoints
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import config from '../config/environment';

// Redis client for production rate limiting
let redisClient: any = null;

// Initialize Redis client for production
if (config.api.nodeEnv === 'production' && process.env.REDIS_URL) {
  redisClient = createClient({
    url: process.env.REDIS_URL
  });
  
  redisClient.on('error', (err: Error) => {
    console.error('Redis Client Error:', err);
  });
  
  redisClient.connect().catch((err: Error) => {
    console.error('Failed to connect to Redis:', err);
    redisClient = null;
  });
}

class RateLimiter {
  /**
   * Get store configuration (Redis for production, memory for development)
   */
  private static getStore() {
    if (config.api.nodeEnv === 'production' && redisClient) {
      return new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      });
    }
    // Use default memory store for development
    return undefined;
  }

  /**
   * General rate limiting for all API endpoints
   */
  static general() {
    return rateLimit({
      store: this.getStore(),
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      message: {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  /**
   * Strict rate limiting for authentication endpoints
   */
  static auth() {
    return rateLimit({
      store: this.getStore(),
      windowMs: config.rateLimit.authWindowMs,
      max: config.rateLimit.authMaxRequests,
      message: {
        error: 'Too Many Auth Requests',
        message: 'Authentication rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(config.rateLimit.authWindowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  /**
   * Lenient rate limiting for OAuth callbacks
   */
  static oauth() {
    return rateLimit({
      store: this.getStore(),
      windowMs: 60 * 1000, // 1 minute
      max: 50, // Allow 50 OAuth callbacks per minute
      message: {
        error: 'Too Many OAuth Requests',
        message: 'OAuth rate limit exceeded. Please try again later.',
        retryAfter: 60
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  /**
   * Lenient rate limiting for webhook endpoints
   */
  static webhook() {
    return rateLimit({
      store: this.getStore(),
      windowMs: 60 * 1000, // 1 minute
      max: 100, // Higher limit for webhooks
      message: {
        error: 'Webhook Rate Limit',
        message: 'Webhook rate limit exceeded'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }
}

export default RateLimiter;
