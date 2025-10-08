/**
 * Centralized Logger Service for Next.js Dashboard using Pino
 * Provides structured logging with correlation IDs and Sentry integration
 */

import pino from 'pino';
// import * as Sentry from '@sentry/nextjs';

// No-op Sentry shim when disabled
const Sentry = {
  addBreadcrumb: () => {},
  captureException: () => {},
  startSpan: <T>(options: unknown, callback: () => T): T => callback(),
};

// Create base logger with environment-specific configuration
const logger = pino({
  name: 'volume-dashboard',
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  
  // Production configuration
  ...(process.env.NODE_ENV === 'production' 
    ? {
        // Structured JSON logging for production
        formatters: {
          level: (label) => ({ level: label }),
        },
      }
    : {
        // Pretty printing for development
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            messageFormat: '{component} | {msg}',
          },
        },
      }
  ),

  // Base fields for all logs
  base: {
    pid: process.pid,
    hostname: undefined, // Remove hostname from logs
    service: 'volume-dashboard',
    environment: process.env.NODE_ENV || 'development',
  },

  // Custom serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    user: (user: { id?: string; username?: string; email?: string; discord_id?: string; discord_username?: string }) => ({
      id: user?.id || user?.discord_id,
      username: user?.username || user?.discord_username,
      // Filter out sensitive data
    }),
  },
});

/**
 * Enhanced logger with context and Sentry integration for Next.js
 */
class DashboardLogger {
  private baseLogger: pino.Logger;

  constructor(baseLogger: pino.Logger) {
    this.baseLogger = baseLogger;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>) {
    return new DashboardLogger(this.baseLogger.child(context));
  }

  /**
   * Set correlation ID for request tracking
   */
  withCorrelationId(correlationId: string) {
    return this.child({ correlationId });
  }

  /**
   * Set component context
   */
  withComponent(component: string) {
    return this.child({ component });
  }

  /**
   * Set user context
   */
  withUser(user: { id?: string; username?: string; email?: string; discord_id?: string; discord_username?: string }) {
    return this.child({ user });
  }

  /**
   * Set request context for API routes
   */
  withRequest(req: { method?: string; url?: string; headers?: Record<string, string | string[]> }) {
    // Filter sensitive headers
    const safeHeaders = { ...req.headers };
    if (safeHeaders.authorization) safeHeaders.authorization = '[Filtered]';
    if (safeHeaders.cookie) safeHeaders.cookie = '[Filtered]';
    
    return this.child({ 
      req: {
        method: req.method,
        url: req.url,
        headers: safeHeaders
      }
    });
  }

  /**
   * Debug level logging
   */
  debug(msg: string, data?: Record<string, unknown>) {
    this.baseLogger.debug(data, msg);
  }

  /**
   * Info level logging
   */
  info(msg: string, data?: Record<string, unknown>) {
    this.baseLogger.info(data, msg);
    
    // Add breadcrumb to Sentry (only on server side)
    if (typeof window === 'undefined') {
      Sentry.addBreadcrumb({
        message: msg,
        category: 'info',
        level: 'info',
        ...(data ? { data } : {}),
      });
    }
  }

  /**
   * Warning level logging
   */
  warn(msg: string, data?: Record<string, unknown>) {
    this.baseLogger.warn(data, msg);
    
    // Add breadcrumb to Sentry
    if (typeof window === 'undefined') {
      Sentry.addBreadcrumb({
        message: msg,
        category: 'warning',
        level: 'warning',
        ...(data ? { data } : {}),
      });
    }
  }

  /**
   * Error level logging with Sentry integration
   */
  error(msg: string, error?: Error | Record<string, unknown>, data?: Record<string, unknown>) {
    if (error instanceof Error) {
      this.baseLogger.error({ err: error, ...data }, msg);
      
      // Send error to Sentry
      if (typeof window === 'undefined') {
        Sentry.captureException(error, {
          tags: {
            component: (this.baseLogger.bindings() as Record<string, unknown>)?.component as string || 'unknown',
            service: 'volume-dashboard',
          },
          extra: {
            message: msg,
            ...data,
          },
        });
      }
    } else {
      this.baseLogger.error({ ...error, ...data }, msg);
      
      // Add breadcrumb to Sentry for non-error objects
      if (typeof window === 'undefined') {
        Sentry.addBreadcrumb({
          message: msg,
          category: 'error',
          level: 'error',
          ...(error || data ? { data: { ...(error as Record<string, unknown>), ...(data as Record<string, unknown>) } } : {}),
        });
      }
    }
  }

  /**
   * Fatal level logging
   */
  fatal(msg: string, error?: Error | Record<string, unknown>, data?: Record<string, unknown>) {
    if (error instanceof Error) {
      this.baseLogger.fatal({ err: error, ...data }, msg);
      
      // Send fatal error to Sentry
      if (typeof window === 'undefined') {
        Sentry.captureException(error, {
          level: 'fatal',
          tags: {
            component: (this.baseLogger.bindings() as Record<string, unknown>)?.component as string || 'unknown',
            service: 'volume-dashboard',
          },
          extra: {
            message: msg,
            ...data,
          },
        });
      }
    } else {
      this.baseLogger.fatal({ ...error, ...data }, msg);
    }
  }

  /**
   * Log API route calls
   */
  apiRoute(method: string, path: string, status?: number, duration?: number, data?: Record<string, unknown>) {
    this.info(`API ${method} ${path}`, {
      api: true,
      method,
      path,
      status,
      duration,
      ...data,
    });
  }

  /**
   * Log external API calls
   */
  externalAPI(service: string, method: string, endpoint: string, status?: number, data?: Record<string, unknown>) {
    this.info(`External API call: ${service} ${method} ${endpoint}`, {
      external_api: true,
      service,
      method,
      endpoint,
      status,
      ...data,
    });
  }

  /**
   * Log user authentication events
   */
  auth(action: string, user?: { id?: string; username?: string; email?: string }, data?: Record<string, unknown>) {
    this.info(`Auth event: ${action}`, {
      auth: true,
      action,
      user,
      ...data,
    });
  }

  /**
   * Log database operations
   */
  database(operation: string, table?: string, data?: Record<string, unknown>) {
    this.debug(`Database operation: ${operation}`, {
      database: true,
      operation,
      table,
      ...data,
    });
  }
}

// Create and export the main logger instance
const mainLogger = new DashboardLogger(logger);

export default mainLogger;
export { DashboardLogger };

// Export convenience methods for common contexts
export const createLogger = (component: string) => mainLogger.withComponent(component);
export const createAPILogger = (component: string, req?: { method?: string; url?: string; headers?: Record<string, string | string[]> } | Request) => {
  const logger = mainLogger.withComponent(component);
  if (!req) return logger;
  
  // Handle NextRequest/Request objects
  if (req instanceof Request) {
    const headersObj: Record<string, string | string[]> = {};
    req.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    
    return logger.withRequest({
      method: req.method,
      url: req.url,
      headers: headersObj
    });
  }
  
  // Handle plain objects
  return logger.withRequest(req);
};
export const createUserLogger = (component: string, user: { id?: string; username?: string; email?: string; discord_id?: string; discord_username?: string }) => 
  mainLogger.withComponent(component).withUser(user);
