import { Router, Request, Response } from 'express';
import PrismaDatabase from '../database/prisma';
import CachedDatabase from '../services/cachedDatabase';
import { requireAuth } from '../middleware/auth';
import { validate, commonSchemas } from '../middleware/validation';
import Joi from 'joi';

const router: Router = Router();

// GET /api/raids/active
router.get('/active', requireAuth, async (_req: Request, res: Response) => {
  try {
    const raids = await CachedDatabase.getActiveRaids();
    return res.json(
      raids.map(r => ({
        id: r.id,
        track_id: r.track_id,
        track_title: r.track_title,
        track_artist: r.track_artist,
        track_artwork_url: r.track_artwork_url,
        premium_only: r.premium_only,
        required_listen_time: r.required_listen_time,
        streams_goal: r.streams_goal,
        current_streams: r.current_streams,
        reward_amount: r.reward_amount,
        token_mint: r.token_mint,
        status: r.status,
        expires_at: r.expires_at
      }))
    );
  } catch (err) {
    console.error('raids/active error', err);
    return res.status(500).json({ error: 'Failed to load active raids' });
  }
});

// GET /api/raids/:id
router.get('/:id', 
  requireAuth, 
  validate({
    params: Joi.object({
      id: commonSchemas.raidId
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const raid = await CachedDatabase.getRaid(req.params.id);
      if (!raid) return res.status(404).json({ error: 'Raid not found' });
      return res.json(raid);
    } catch (err) {
      console.error('raids/:id error', err);
      return res.status(500).json({ error: 'Failed to load raid' });
    }
  }
);

// POST /api/raids/:id/join
router.post('/:id/join', 
  requireAuth, 
  validate({
    params: Joi.object({
      id: commonSchemas.raidId
    })
  }),
  async (req: Request, res: Response) => {
  try {
    const discordId = req.sessionUser!.discordId;
    const raidId = req.params.id;

    const raid = await PrismaDatabase.getRaid(raidId);
    if (!raid || raid.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Raid is not active' });
    }

    // Ensure user exists
    const user = await PrismaDatabase.getUser(discordId);
    if (!user) {
      return res.status(403).json({ error: 'User not registered' });
    }

    // Add or resume participant
    const participant = await PrismaDatabase.addRaidParticipant(raidId, discordId);

    const tracking = user.spotify_is_premium ? 'web_playback_sdk' : 'currently_playing_api';

    return res.json({
      ok: true,
      participant_id: participant.id,
      tracking_method: tracking
    });
  } catch (err) {
    console.error('raids/:id/join error', err);
    return res.status(500).json({ error: 'Failed to join raid' });
  }
});

// POST /api/raids/:id/claim
router.post('/:id/claim',
  requireAuth,
  validate({
    params: Joi.object({
      id: commonSchemas.raidId
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const raidId = parseInt(req.params.id, 10);
      const discordId = req.sessionUser!.discordId;

      const raid = await PrismaDatabase.getRaid(raidId);
      if (!raid) {
        return res.status(404).json({ error: 'Raid not found' });
      }

      const participant = await PrismaDatabase.checkExistingParticipant(raidId, discordId);
      if (!participant) {
        return res.status(403).json({ error: 'You did not participate in this raid' });
      }

      if (!participant.qualified) {
        return res.status(400).json({ error: 'You have not qualified for this raid' });
      }

      if (participant.claimed_reward) {
        return res.status(400).json({ error: 'Reward already claimed' });
      }

      const rewardAmountRaw = raid.reward_amount ?? 0;
      const rewardAmount = typeof rewardAmountRaw === 'number'
        ? rewardAmountRaw
        : Number(rewardAmountRaw);

      if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
        return res.status(500).json({ error: 'Invalid reward configuration' });
      }

      await PrismaDatabase.claimReward(raidId, discordId);
      await PrismaDatabase.updateUserTokens(discordId, rewardAmount);

      return res.json({
        success: true,
        amount: rewardAmount,
        token_mint: raid.token_mint
      });
    } catch (err) {
      console.error('raids/:id/claim error', err);
      return res.status(500).json({ error: 'Failed to claim raid reward' });
    }
  }
);

// GET /api/raids/mine
router.get('/mine/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const items = await PrismaDatabase.getUserRaids((req as any).sessionUser.discordId as string);
    return res.json(items.map(p => ({
      id: p.id,
      raid_id: p.raid_id,
      qualified: p.qualified,
      claimed_reward: p.claimed_reward,
      total_listen_duration: p.total_listen_duration,
      created_at: p.created_at,
      raid: p.raid
    })));
  } catch (err) {
    console.error('raids/mine error', err);
    return res.status(500).json({ error: 'Failed to load my raids' });
  }
});

// GET /api/raids/history
router.get('/history/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const items = await PrismaDatabase.getUserRaidHistory((req as any).sessionUser.discordId as string);
    return res.json(items.map(p => ({
      id: p.id,
      raid_id: p.raid_id,
      qualified: p.qualified,
      claimed_reward: p.claimed_reward,
      claimed_at: p.claimed_at,
      total_listen_duration: p.total_listen_duration,
      raid: p.raid
    })));
  } catch (err) {
    console.error('raids/history error', err);
    return res.status(500).json({ error: 'Failed to load raid history' });
  }
});

export default router;
