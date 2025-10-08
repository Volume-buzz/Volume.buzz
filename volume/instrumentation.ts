/**
 * Next.js Instrumentation - DISABLED (Sentry removed)
 * This file is automatically loaded by Next.js for both server and edge runtimes
 */

export async function register() {
  // Sentry disabled - no-op
  // if (process.env.NEXT_RUNTIME === 'nodejs') {
  //   await import('./sentry.server.config');
  // }
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('./sentry.edge.config');
  // }
}

export async function onRequestError(
  err: unknown,
  request: {
    path: string
  },
  context: {
    routerKind: string
    routeType: string
    renderSource: string
  }
) {
  // Sentry disabled - just log the error
  console.error('Request error:', err, { path: request.path, context });
}