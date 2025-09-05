/**
 * Sentry Server Configuration for Next.js Dashboard
 * This runs on the server (Node.js)
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment configuration
  environment: process.env.NODE_ENV || 'development',

  // Adjust this value in production, or use tracesSampler for finer control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry
  debug: process.env.NODE_ENV === 'development',

  // Enable experimental logs feature
  _experiments: {
    enableLogs: true,
  },

  integrations: [
    // Capture console logs as breadcrumbs
    Sentry.consoleLoggingIntegration({
      levels: ["error", "warn"] // Only capture console.error and console.warn
    }),
    // Node.js specific integrations
    Sentry.nodeContextIntegration(),
    Sentry.localVariablesIntegration({
      captureAllExceptions: false,
    }),
  ],

  // Before send hook to filter out sensitive data
  beforeSend(event) {
    // Filter out environment variables that might contain secrets
    if (event.extra) {
      Object.keys(event.extra).forEach(key => {
        if (typeof event.extra![key] === 'string') {
          const value = event.extra![key] as string;
          // Filter out potential secrets/tokens
          if (key.toLowerCase().includes('secret') || 
              key.toLowerCase().includes('token') || 
              key.toLowerCase().includes('key') ||
              key.toLowerCase().includes('password') ||
              (typeof value === 'string' && value.length > 50)) {
            event.extra![key] = '[Filtered]';
          }
        }
      });
    }

    // Filter out request headers that might contain auth tokens
    if (event.request?.headers) {
      const headers = event.request.headers;
      Object.keys(headers).forEach(header => {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('authorization') || 
            lowerHeader.includes('cookie') ||
            lowerHeader.includes('token')) {
          headers[header] = '[Filtered]';
        }
      });
    }

    return event;
  },

  // Configure which URLs should be traced
  tracePropagationTargets: [
    // Local development
    "localhost",
    // Your production API endpoints
    /^\/api\//,
    // Discord Bot API calls
    /^https:\/\/.*\.epiclootlabs\.com/,
  ],

  // Release tracking
  release: process.env.npm_package_version || 'development',
});