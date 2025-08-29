/**
 * Authentication routes for OAuth callbacks
 */

import { Router } from 'express';
import RateLimiter from '../middleware/rateLimiter';

const router = Router();

// Apply auth-specific rate limiting
router.use(RateLimiter.auth());

// Placeholder OAuth routes - actual implementation is in oauthServer.ts
router.get('/spotify/callback', (req, res) => {
  res.redirect('/oauth/spotify/callback?' + new URLSearchParams(req.query as any));
});

router.get('/audius/callback', (req, res) => {
  res.redirect('/oauth/audius/callback?' + new URLSearchParams(req.query as any));
});

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'auth-routes',
    timestamp: new Date().toISOString() 
  });
});

export default router;
