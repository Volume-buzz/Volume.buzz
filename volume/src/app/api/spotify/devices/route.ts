import { NextRequest, NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createAPILogger } from '@/lib/logger';

// No-op Sentry shim when disabled
const Sentry = {
  addBreadcrumb: () => {},
  captureException: () => {},
  startSpan: <T>(options: unknown, callback: () => T): T => callback(),
};

export async function GET(req: NextRequest) {
  return Sentry.startSpan(
    { 
      op: "http.server", 
      name: "GET /api/spotify/devices",
      attributes: {
        "http.method": "GET",
        "http.url": req.url,
      }
    },
    async () => {
      const logger = createAPILogger('SpotifyDevicesAPI', req);
      const startTime = Date.now();
      
      try {
        logger.info('Processing Spotify devices request', { endpoint: '/api/spotify/devices' });
        
        const session = req.cookies.get('session')?.value;
        if (!session) {
          logger.warn('Unauthorized request - no session cookie', { status: 401 });
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'Unauthorized request - no session cookie',
            level: 'warning',
          });
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const apiBase = process.env.NEXT_PUBLIC_API_BASE!;
        
        const res = await Sentry.startSpan(
          {
            op: "http.client",
            name: `GET ${apiBase}/api/spotify/devices`,
            attributes: {
              "http.method": "GET",
              "http.url": `${apiBase}/api/spotify/devices`,
            }
          },
          () => fetch(`${apiBase}/api/spotify/devices`, { 
            headers: { Authorization: `Bearer ${session}` } 
          })
        );
        
        const data = await res.json();
        const duration = Date.now() - startTime;
        
        logger.externalAPI('discord-bot', 'GET', '/api/spotify/devices', res.status, { 
          duration,
          response_size: JSON.stringify(data).length 
        });
        
        Sentry.addBreadcrumb({
          category: 'api',
          message: `Spotify devices API responded with status ${res.status}`,
          level: res.status >= 400 ? 'error' : 'info',
          data: { status: res.status, duration }
        });

        return NextResponse.json(data, { status: res.status });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('Spotify devices API error', error as Error, {
          endpoint: '/api/spotify/devices',
          duration,
          status: 500
        });
        Sentry.captureException(error, {
          tags: {
            component: 'spotify_devices_api',
            endpoint: '/api/spotify/devices'
          }
        });
        return NextResponse.json({ error: 'Failed to load devices' }, { status: 500 });
      }
    }
  );
}

