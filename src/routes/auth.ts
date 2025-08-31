/**
 * Authentication routes for OAuth callbacks
 */

import { Router } from 'express';
import RateLimiter from '../middleware/rateLimiter';
import PrismaDatabase from '../database/prisma';
import DMService from '../services/dmService';
import config from '../config/environment';

const router = Router();

// Apply auth-specific rate limiting
router.use(RateLimiter.auth());

// DM service instance (will be set by server)
let dmService: DMService;

// OAuth server instance (will be set by server)
let oauthServer: any;

// SPOTIFY OAUTH CALLBACK - Delegate to OAuthServer
router.get('/spotify/callback', async (req, res): Promise<void> => {
  try {
    if (!oauthServer) {
      console.error('OAuth server not initialized');
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
            <h2>❌ Server Error</h2>
            <p>OAuth server not properly initialized</p>
            <p>Please contact the administrator.</p>
          </body>
        </html>
      `);
      return;
    }

    // Delegate to the consolidated OAuth handler
    await oauthServer.handleSpotifyCallback(req, res);
  } catch (error) {
    console.error('Error handling Spotify callback:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
          <h2>❌ Server Error</h2>
          <p>Something went wrong. Please try again in Discord.</p>
          <p>Error: ${(error as any).message}</p>
        </body>
      </html>
    `);
  }
});


router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-routes',
    timestamp: new Date().toISOString() 
  });
});

// Function to set service instances
export function setDMService(service: DMService) {
  dmService = service;
}

export function setOAuthServer(server: any) {
  oauthServer = server;
}

export default router;