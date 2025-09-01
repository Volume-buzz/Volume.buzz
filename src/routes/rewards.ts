/**
 * Rewards management routes
 */

import { Router, type Router as RouterType } from 'express';

const router: RouterType = Router();

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'rewards-routes',
    timestamp: new Date().toISOString() 
  });
});

// Placeholder rewards routes
router.get('/pending', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
