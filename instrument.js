/**
 * Sentry instrumentation for Discord Bot
 * This file must be imported first, before any other modules
 */

const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Initialize Sentry before any other imports
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment configuration
  environment: process.env.NODE_ENV || 'development',

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing
  // Adjust this value in production for better performance
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Set profilesSampleRate to 1.0 to profile 100% of sampled transactions
  // This is relative to tracesSampleRate
  profilesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Send default PII (personally identifiable information) like user IPs
  sendDefaultPii: true,

  // Integrations
  integrations: [
    // Add profiling integration
    nodeProfilingIntegration(),
    // Auto-capture console logs as breadcrumbs
    Sentry.consoleLoggingIntegration({
      levels: ["error", "warn"] // Only capture console.error and console.warn
    }),
  ],

  // Before send hook to filter out sensitive data
  beforeSend(event, hint) {
    // Filter out Discord tokens and sensitive data
    if (event.extra) {
      // Remove any potential token data
      Object.keys(event.extra).forEach(key => {
        if (typeof event.extra[key] === 'string' && 
            (key.toLowerCase().includes('token') || 
             key.toLowerCase().includes('secret') ||
             event.extra[key].includes('Bot ') ||
             event.extra[key].length > 50)) {
          event.extra[key] = '[Filtered]';
        }
      });
    }
    return event;
  },

  // Configure release tracking
  release: process.env.npm_package_version || 'development',
});

// Export Sentry for use in other modules
module.exports = Sentry;

// Use a simple console.log here since logger isn't available yet during instrumentation
console.log('🔍 Sentry initialized for Discord Bot');