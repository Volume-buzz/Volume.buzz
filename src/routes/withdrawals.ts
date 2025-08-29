/**
 * Withdrawal management routes
 */

import { Router } from 'express';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'withdrawal-routes',
    timestamp: new Date().toISOString() 
  });
});

// Placeholder withdrawal routes
router.post('/request', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
