/**
 * Authentication routes for OAuth callbacks
 */

import { Router, type Router as RouterType } from 'express';
import RateLimiter from '../middleware/rateLimiter';
import DMService from '../services/dmService';
import config from '../config/environment';

const router: RouterType = Router();

// DM service instance (will be set by server)
let dmService: DMService;

// OAuth server instance (will be set by server)
let oauthServer: any;

// SPOTIFY OAUTH CALLBACK - Delegate to OAuthServer
// Use lenient OAuth rate limiting for callback endpoints
router.get('/spotify/callback', RateLimiter.oauth(), async (req, res): Promise<void> => {
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
          ${config.api.nodeEnv === 'development' ? `<p>Error: ${(error as any).message}</p>` : ''}
        </body>
      </html>
    `);
  }
});

// AUDIUS OAUTH CALLBACK (returns HTML that posts token payload)
router.get('/audius/callback', async (req, res): Promise<void> => {
  try {
    if (!oauthServer) {
      res.status(500).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #130224; color: white;">
            <h2>❌ Server Error</h2>
            <p>OAuth server not properly initialized</p>
          </body>
        </html>
      `);
      return;
    }

    await oauthServer.renderAudiusCallbackPage(req, res);
  } catch (error) {
    console.error('Error rendering Audius callback page:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #130224; color: white;">
          <h2>❌ Server Error</h2>
          <p>Failed to load Audius callback. Please retry from Discord.</p>
        </body>
      </html>
    `);
  }
});

// AUDIUS OAUTH TOKEN EXCHANGE
router.post('/audius/token', RateLimiter.oauth(), async (req, res): Promise<void> => {
  try {
    if (!oauthServer) {
      res.status(500).json({ success: false, error: 'OAuth server not initialized' });
      return;
    }

    await oauthServer.handleAudiusToken(req, res);
  } catch (error) {
    console.error('Error handling Audius token exchange:', error);
    res.status(500).json({ success: false, error: 'Audius authentication failed. Please retry from Discord.' });
  }
});


// Status endpoint with general auth rate limiting
router.get('/status', RateLimiter.auth(), (req, res) => {
  res.json({
    status: 'ok',
    service: 'auth-routes',
    timestamp: new Date().toISOString()
  });
});

// Get current authenticated user info
router.get('/me', RateLimiter.auth(), async (req, res) => {
  try {
    const sessionUser = (req as any).sessionUser;

    if (!sessionUser || !sessionUser.discordId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { prisma } = await import('../database/prisma');

    const user = await prisma.user.findUnique({
      where: { discord_id: sessionUser.discordId },
      select: {
        discord_id: true,
        discord_username: true,
        audius_user_id: true,
        audius_handle: true,
        audius_name: true,
        audius_verified: true,
        privy_wallet_address: true,
        role: true,
      },
    });

    if (!user) {
      return res.json({
        discord_id: sessionUser.discordId,
        authenticated: true,
        audius_connected: false,
        wallet_connected: false,
      });
    }

    return res.json({
      discord_id: user.discord_id,
      discord_username: user.discord_username,
      authenticated: true,
      audius_connected: !!user.audius_user_id,
      audius_handle: user.audius_handle,
      audius_name: user.audius_name,
      audius_verified: user.audius_verified,
      wallet_connected: !!user.privy_wallet_address,
      wallet_address: user.privy_wallet_address,
      role: user.role,
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    return res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// Verify OAuth state for wallet connection
router.get('/verify-state', RateLimiter.auth(), async (req, res) => {
  try {
    const { state } = req.query;

    if (!state || typeof state !== 'string') {
      return res.status(400).json({ error: 'State parameter is required' });
    }

    const { prisma } = await import('../database/prisma');

    // Find OAuth session with this state
    const session = await prisma.oAuthSession.findUnique({
      where: { state },
    });

    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired state' });
    }

    // Check if expired
    if (session.expires_at < new Date()) {
      await prisma.oAuthSession.delete({ where: { state } });
      return res.status(410).json({ error: 'State has expired' });
    }

    return res.json({
      discord_id: session.discord_id,
      platform: session.platform,
    });
  } catch (error) {
    console.error('Error verifying state:', error);
    return res.status(500).json({ error: 'Failed to verify state' });
  }
});

// Link Audius account to Discord user (called from dashboard after Audius OAuth)
router.post('/link-audius', RateLimiter.auth(), async (req, res) => {
  try {
    const { discord_id, audius_user_id, audius_handle, audius_name, audius_email, audius_profile_picture, audius_verified } = req.body;

    if (!discord_id || !audius_user_id) {
      return res.status(400).json({ error: 'discord_id and audius_user_id are required' });
    }

    const { prisma } = await import('../database/prisma');

    // Update or create user with Audius info
    const user = await prisma.user.upsert({
      where: { discord_id },
      update: {
        audius_user_id,
        audius_handle,
        audius_name,
        audius_email,
        audius_profile_picture,
        audius_verified: audius_verified || false,
      },
      create: {
        discord_id,
        audius_user_id,
        audius_handle,
        audius_name,
        audius_email,
        audius_profile_picture,
        audius_verified: audius_verified || false,
      },
    });

    return res.json({
      success: true,
      message: 'Audius account linked successfully',
      user: {
        discord_id: user.discord_id,
        audius_handle: user.audius_handle,
        audius_user_id: user.audius_user_id,
      },
    });
  } catch (error) {
    console.error('Error linking Audius account:', error);
    return res.status(500).json({ error: 'Failed to link Audius account' });
  }
});

// Function to set service instances
export function setDMService(service: DMService) {
  dmService = service;
}

export function setOAuthServer(server: any) {
  oauthServer = server;
}

export default router;
