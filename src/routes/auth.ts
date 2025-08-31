/**
 * Authentication routes for OAuth callbacks
 */

import { Router } from 'express';
import RateLimiter from '../middleware/rateLimiter';
import AudiusService from '../services/audiusService';
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

// AUDIUS OAUTH CALLBACK  
router.get('/audius/callback', async (req, res) => {
  try {
    console.log('📥 Audius OAuth callback received:', JSON.stringify(req.query, null, 2));
    
    // Audius uses JWT token, not authorization code
    const { token, state, error } = req.query;
    
    if (error) {
      console.error('Audius OAuth error:', error);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
            <h2>❌ Audius Authorization Failed</h2>
            <p>Error: ${error}</p>
            <p>You can close this window and try again in Discord.</p>
          </body>
        </html>
      `);
    }

    if (!token || !state) {
      console.error('Missing Audius OAuth parameters:', { token: !!token, state: !!state });
      console.log('Full Audius query object:', req.query);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
            <h2>❌ Missing Parameters</h2>
            <p>Missing JWT token (${!!token}) or state parameter (${!!state})</p>
            <p>Debug: ${JSON.stringify(req.query)}</p>
            <p>You can close this window and try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Get OAuth session to find Discord user
    const session = await PrismaDatabase.getOAuthSession(state as string);
    if (!session) {
      console.error(`No OAuth session found for Audius state: ${state}`);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
            <h2>❌ Session Expired</h2>
            <p>OAuth session not found. Please try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Verify JWT token with Audius API
    const audiusService = new AudiusService();
    const userProfile = await audiusService.verifyAudiusToken(token as string);
    
    if (!userProfile) {
      console.error('Failed to verify Audius JWT token');
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
            <h2>❌ Token Verification Failed</h2>
            <p>Could not verify your Audius account.</p>
            <p>Token: ${(token as string).substring(0, 50)}...</p>
            <p>Please try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Update user with Audius data
    await PrismaDatabase.updateUser(session.discord_id, {
      audiusUserId: userProfile.userId,
      audiusHandle: userProfile.handle,
      audiusName: userProfile.name
    });

    console.log(`✅ Audius OAuth successful: ${userProfile.name} (@${userProfile.handle}) → Discord ${session.discord_id}`);
    
    // Send DM notification
    if (dmService) {
      await dmService.notifyAudiusConnected(session.discord_id, userProfile);
    }

    // Clean up OAuth session
    await PrismaDatabase.deleteOAuthSession(state as string);

    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
          <h2>✅ Audius Connected Successfully!</h2>
          <p><strong>${userProfile.name}</strong> (@${userProfile.handle})</p>
          <p>Your Audius account has been linked to Discord.</p>
          <p><strong>You can now close this window and return to Discord.</strong></p>
          <p>Check your account status with <code>/account</code> in Discord.</p>
          <script>
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error handling Audius callback:', error);
    console.error('Full error details:', error);
    return res.status(500).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #CC0FE0; color: white;">
          <h2>❌ Server Error</h2>
          <p>Something went wrong processing your request.</p>
          <p>Error: ${(error as any).message}</p>
          <p>You can close this window and try again in Discord.</p>
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