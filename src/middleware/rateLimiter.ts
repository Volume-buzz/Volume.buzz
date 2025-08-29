/**
 * Rate limiting middleware for API endpoints
 */

import rateLimit from 'express-rate-limit';
import config from '../config/environment';

class RateLimiter {
  /**
   * General rate limiting for all API endpoints
   */
  static general() {
    return rateLimit({
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
   * Lenient rate limiting for webhook endpoints
   */
  static webhook() {
    return rateLimit({
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
