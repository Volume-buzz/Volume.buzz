/**
 * Rewards management routes
 */

import { Router, type Router as RouterType, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import PrismaDatabase from '../database/prisma';

const router: RouterType = Router();

router.get('/status', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'rewards-routes',
    timestamp: new Date().toISOString() 
  });
});

// Recent rewards for current user
// DEPRECATED: RewardAccrual table no longer exists
// Use listening party claims instead
router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    // Return empty for now - TODO: implement with listening party participants
    return res.json([]);
    // const discordId = (req as any).sessionUser.discordId as string;
    // const items = await PrismaDatabase.getUserRecentRewards(discordId, 5);
    // return res.json(items.map((i: any) => ({
    //   id: i.id,
    //   token: { mint: i.token_mint, symbol: i.token.symbol },
    //   amount: i.amount,
    //   raid_id: i.raid_id,
    //   created_at: i.created_at
    // })));
  } catch (err) {
    console.error('rewards/mine error', err);
    return res.status(500).json({ error: 'Failed to load rewards' });
  }
});

export default router;
