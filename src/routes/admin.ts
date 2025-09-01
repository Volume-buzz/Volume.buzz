/**
 * Admin management routes
 */

import { Router, type Router as RouterType } from 'express';

const router: RouterType = Router();

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
