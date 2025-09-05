/**
 * Sentry Edge Configuration for Next.js Dashboard
 * This runs in the Edge Runtime (middleware, edge API routes)
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Environment configuration
  environment: process.env.NODE_ENV || 'development',

  // Adjust this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry
  debug: process.env.NODE_ENV === 'development',

  // Before send hook to filter out sensitive data
  beforeSend(event) {
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

  // Release tracking
  release: process.env.npm_package_version || 'development',
});