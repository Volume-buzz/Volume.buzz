/**
 * Rewards management routes
 */

import { Router } from 'express';

const router = Router();

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
