/**
 * Sentry Client Configuration for Next.js Dashboard
 * This runs in the browser
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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
    // Browser tracing integration
    Sentry.browserTracingIntegration(),
    // Replay integration for session recordings (optional, can be resource intensive)
    ...(process.env.NODE_ENV === 'production' ? [
      Sentry.replayIntegration()
    ] : []),
  ],

  // Before send hook to filter out sensitive data
  beforeSend(event) {
    // Filter out potential sensitive data from URLs and forms
    if (event.request?.url) {
      // Remove query parameters that might contain tokens
      const url = new URL(event.request.url);
      if (url.searchParams.has('token') || url.searchParams.has('code') || url.searchParams.has('state')) {
        url.searchParams.set('token', '[Filtered]');
        url.searchParams.set('code', '[Filtered]');
        url.searchParams.set('state', '[Filtered]');
        event.request.url = url.toString();
      }
    }

    // Filter out localStorage/sessionStorage data that might be sensitive
    if (event.contexts?.storage) {
      delete event.contexts.storage;
    }

    return event;
  },

  // Configure which URLs should be traced
  tracePropagationTargets: [
    // Local development
    "localhost",
    // Your production API endpoints
    /^\/api\//,
    // Add your production domains here
    /^https:\/\/.*\.epiclootlabs\.com/,
  ],

  // Release tracking
  release: process.env.npm_package_version || 'development',
});

// Export navigation hook as required by Sentry
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;