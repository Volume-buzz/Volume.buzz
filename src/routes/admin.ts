/**
 * Admin management routes
 */

import { Router } from 'express';

const router = Router();

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'admin-routes',
    timestamp: new Date().toISOString() 
  });
});

// Placeholder admin routes
router.get('/stats', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
