/**
 * Next.js Instrumentation for Sentry
 * This file is automatically loaded by Next.js for both server and edge runtimes
 */

export async function register() {
  // Only register Sentry on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  // Only register Sentry on the edge runtime
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
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
  // Import Sentry dynamically to avoid loading it on the client
  const Sentry = await import('@sentry/nextjs');
  
  Sentry.captureException(err, {
    tags: {
      component: 'next_request_error',
      router_kind: context.routerKind,
      route_type: context.routeType,
      render_source: context.renderSource
    },
    extra: {
      request_path: request.path,
      context
    }
  });
}