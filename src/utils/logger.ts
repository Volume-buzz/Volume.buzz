/**
 * Centralized Logger Service using Pino
 * Provides structured logging with correlation IDs and Sentry integration
 */

import pino from 'pino';
import * as Sentry from '@sentry/node';

// Create base logger with environment-specific configuration
const logger = pino({
  name: 'discord-bot',
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
    service: 'discord-bot',
    environment: process.env.NODE_ENV || 'development',
  },

  // Custom serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    user: (user: any) => ({
      id: user?.id || user?.discord_id,
      username: user?.username || user?.discord_username,
      // Filter out sensitive data
    }),
    guild: (guild: any) => ({
      id: guild?.id,
      name: guild?.name,
    }),
  },
});

/**
 * Enhanced logger with context and Sentry integration
 */
class Logger {
  private baseLogger: pino.Logger;

  constructor(baseLogger: pino.Logger) {
    this.baseLogger = baseLogger;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, any>) {
    return new Logger(this.baseLogger.child(context));
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
  withUser(user: { id?: string; username?: string; discord_id?: string; discord_username?: string }) {
    return this.child({ user });
  }

  /**
   * Set Discord guild context
   */
  withGuild(guild: { id?: string; name?: string }) {
    return this.child({ guild });
  }

  /**
   * Debug level logging
   */
  debug(msg: string, data?: Record<string, any>) {
    this.baseLogger.debug(data, msg);
  }

  /**
   * Info level logging
   */
  info(msg: string, data?: Record<string, any>) {
    this.baseLogger.info(data, msg);
    
    // Add breadcrumb to Sentry
    Sentry.addBreadcrumb({
      message: msg,
      category: 'info',
      level: 'info',
      data: data || {},
    });
  }

  /**
   * Warning level logging
   */
  warn(msg: string, data?: Record<string, any>) {
    this.baseLogger.warn(data, msg);
    
    // Add breadcrumb to Sentry
    Sentry.addBreadcrumb({
      message: msg,
      category: 'warning',
      level: 'warning',
      data: data || {},
    });
  }

  /**
   * Error level logging with Sentry integration
   */
  error(msg: string, error?: Error | Record<string, any>, data?: Record<string, any>) {
    if (error instanceof Error) {
      this.baseLogger.error({ err: error, ...data }, msg);
      
      // Send error to Sentry
      Sentry.captureException(error, {
        tags: {
          component: (this.baseLogger as any).bindings()?.component || 'unknown',
          service: 'discord-bot',
        },
        extra: {
          message: msg,
          ...data,
        },
      });
    } else {
      this.baseLogger.error({ ...error, ...data }, msg);
      
      // Add breadcrumb to Sentry for non-error objects
      Sentry.addBreadcrumb({
        message: msg,
        category: 'error',
        level: 'error',
        data: { ...error, ...data },
      });
    }
  }

  /**
   * Fatal level logging
   */
  fatal(msg: string, error?: Error | Record<string, any>, data?: Record<string, any>) {
    if (error instanceof Error) {
      this.baseLogger.fatal({ err: error, ...data }, msg);
      
      // Send fatal error to Sentry
      Sentry.captureException(error, {
        level: 'fatal',
        tags: {
          component: (this.baseLogger as any).bindings()?.component || 'unknown',
          service: 'discord-bot',
        },
        extra: {
          message: msg,
          ...data,
        },
      });
    } else {
      this.baseLogger.fatal({ ...error, ...data }, msg);
    }
  }

  /**
   * Log Discord command execution
   */
  discordCommand(commandName: string, user: any, guild?: any, data?: Record<string, any>) {
    this.info(`Discord command executed: /${commandName}`, {
      command: commandName,
      user,
      guild,
      ...data,
    });
  }

  /**
   * Log Spotify API calls
   */
  spotifyAPI(method: string, endpoint: string, status?: number, data?: Record<string, any>) {
    this.info(`Spotify API call: ${method} ${endpoint}`, {
      api: 'spotify',
      method,
      endpoint,
      status,
      ...data,
    });
  }

  /**
   * Log database operations
   */
  database(operation: string, table?: string, data?: Record<string, any>) {
    this.debug(`Database operation: ${operation}`, {
      database: true,
      operation,
      table,
      ...data,
    });
  }

  /**
   * Log raid activities
   */
  raid(action: string, raidId?: string | number, data?: Record<string, any>) {
    this.info(`Raid activity: ${action}`, {
      raid: true,
      action,
      raidId: raidId?.toString(),
      ...data,
    });
  }
}

// Create and export the main logger instance
const mainLogger = new Logger(logger);

export default mainLogger;
export { Logger };

// Export convenience methods for common contexts
export const createLogger = (component: string) => mainLogger.withComponent(component);
export const createUserLogger = (component: string, user: any) => 
  mainLogger.withComponent(component).withUser(user);
export const createGuildLogger = (component: string, guild: any) => 
  mainLogger.withComponent(component).withGuild(guild);