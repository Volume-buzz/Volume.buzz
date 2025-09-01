/**
 * Webhook routes for external services
 */

import { Router, type Router as RouterType } from 'express';
import RateLimiter from '../middleware/rateLimiter';

const router: RouterType = Router();

// Apply webhook-specific rate limiting
router.use(RateLimiter.webhook());

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'webhook-routes',
    timestamp: new Date().toISOString() 
  });
});

// Placeholder webhook routes
router.post('/helius', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/spotify', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
