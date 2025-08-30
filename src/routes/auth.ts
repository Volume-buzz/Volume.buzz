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

// SPOTIFY OAUTH CALLBACK
router.get('/spotify/callback', async (req, res) => {
  try {
    console.log('📥 Spotify OAuth callback received:', JSON.stringify(req.query, null, 2));
    
    const { code, state, error } = req.query;
    
    if (error) {
      console.error('Spotify OAuth error:', error);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
            <h2>❌ Spotify Authorization Failed</h2>
            <p>Error: ${error}</p>
            <p>You can close this window and try again in Discord.</p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      console.error('Missing Spotify OAuth parameters:', { code: !!code, state: !!state });
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
            <h2>❌ Missing Parameters</h2>
            <p>Missing authorization code (${!!code}) or state parameter (${!!state})</p>
            <p>Debug: ${JSON.stringify(req.query)}</p>
            <p>You can close this window and try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Get OAuth session to find Discord user
    const session = await PrismaDatabase.getOAuthSession(state as string);
    if (!session) {
      console.error(`No OAuth session found for Spotify state: ${state}`);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
            <h2>❌ Session Expired</h2>
            <p>OAuth session not found. Please try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: config.spotify.redirectUri
      })
    });

    if (!tokenResponse.ok) {
      console.error('Failed to get Spotify access token:', tokenResponse.status);
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
            <h2>❌ Authorization Failed</h2>
            <p>Failed to get access token from Spotify</p>
            <p>Please try again in Discord.</p>
          </body>
        </html>
      `);
    }

    const tokens = await tokenResponse.json();
    
    // Get user profile from Spotify
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (profileResponse.ok) {
      const profile = await profileResponse.json();
      
      // Update user with Spotify data  
      await PrismaDatabase.updateUser(session.discord_id, {
        spotifyUserId: profile.id,
        spotifyDisplayName: profile.display_name,
        spotifyEmail: profile.email,
        spotifyIsPremium: profile.product === 'premium'
      });
      
      console.log(`✅ Spotify connected: ${profile.display_name} → Discord ${session.discord_id}`);
      
      // Send DM notification
      if (dmService) {
        await dmService.notifySpotifyConnected(session.discord_id, profile);
      }
    }

    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px; background: #1DB954; color: white;">
          <h2>✅ Spotify Connected Successfully!</h2>
          <p>Your Spotify account has been linked to Discord.</p>
          <p><strong>You can now close this window and return to Discord.</strong></p>
          <p>Check your account status with <code>/account</code> in Discord.</p>
          <script>
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Error handling Spotify callback:', error);
    return res.status(500).send(`
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
            <p>Please try again in Discord.</p>
          </body>
        </html>
      `);
    }

    // Update user with Audius data
    await PrismaDatabase.updateUser(session.discord_id, {
      audiusUserId: userProfile.userId.toString(),
      audiusHandle: userProfile.handle,
      audiusName: userProfile.name
    });

    console.log(`✅ Audius OAuth successful: ${userProfile.name} (@${userProfile.handle}) → Discord ${session.discord_id}`);
    
    // Send DM notification
    if (dmService) {
      await dmService.notifyAudiusConnected(session.discord_id, userProfile);
    }

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

// Function to set DM service instance
export function setDMService(service: DMService) {
  dmService = service;
}

export default router;