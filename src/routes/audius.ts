/**
 * Audius API Routes
 * Handles Audius-related API calls including verification and now-playing checks
 */

import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validation';
import Joi from 'joi';
import audiusVerification from '../services/audiusVerification';

const router: Router = Router();

/**
 * GET /api/audius/now-playing/:userId
 * Proxy to Audius API to check what track a user is currently playing
 */
router.get(
  '/now-playing/:userId',
  validate({
    params: Joi.object({
      userId: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const nowPlaying = await audiusVerification.checkNowPlaying(userId);

      if (!nowPlaying) {
        return res.json({
          isPlaying: false,
          track: null,
        });
      }

      return res.json({
        isPlaying: true,
        track: {
          id: nowPlaying.id,
          title: nowPlaying.title,
        },
      });
    } catch (error) {
      console.error('Error fetching now-playing:', error);
      return res.status(500).json({ error: 'Failed to fetch now-playing data' });
    }
  }
);

/**
 * POST /api/audius/verify-listening
 * Verify if a user is playing the correct track
 */
router.post(
  '/verify-listening',
  validate({
    body: Joi.object({
      audius_user_id: Joi.string().required(),
      expected_track_id: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { audius_user_id, expected_track_id } = req.body;

      const verification = await audiusVerification.verifyListening(
        audius_user_id,
        expected_track_id
      );

      return res.json({
        is_playing: verification.isPlaying,
        track_matches: verification.trackMatches,
        verified: verification.isPlaying && verification.trackMatches,
      });
    } catch (error) {
      console.error('Error verifying listening:', error);
      return res.status(500).json({ error: 'Failed to verify listening' });
    }
  }
);

/**
 * POST /api/audius/start-tracking
 * Start tracking a user's listening session for a party
 */
router.post(
  '/start-tracking',
  validate({
    body: Joi.object({
      party_id: Joi.string().required(),
      discord_id: Joi.string().required(),
      audius_user_id: Joi.string().required(),
      track_id: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { party_id, discord_id, audius_user_id, track_id } = req.body;

      const result = await audiusVerification.startTracking(
        party_id,
        discord_id,
        audius_user_id,
        track_id
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      return res.json({
        success: true,
        message: result.message,
        participant_id: result.participantId,
      });
    } catch (error) {
      console.error('Error starting tracking:', error);
      return res.status(500).json({ error: 'Failed to start tracking' });
    }
  }
);

/**
 * POST /api/audius/heartbeat
 * Record a heartbeat for active listening verification
 */
router.post(
  '/heartbeat',
  validate({
    body: Joi.object({
      party_id: Joi.string().required(),
      discord_id: Joi.string().required(),
      audius_user_id: Joi.string().required(),
      track_id: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { party_id, discord_id, audius_user_id, track_id } = req.body;

      const result = await audiusVerification.recordHeartbeat(
        party_id,
        discord_id,
        audius_user_id,
        track_id
      );

      return res.json(result);
    } catch (error) {
      console.error('Error recording heartbeat:', error);
      return res.status(500).json({ error: 'Failed to record heartbeat' });
    }
  }
);

/**
 * POST /api/audius/stop-tracking
 * Stop tracking a user's listening session
 */
router.post(
  '/stop-tracking',
  validate({
    body: Joi.object({
      party_id: Joi.string().required(),
      discord_id: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { party_id, discord_id } = req.body;

      await audiusVerification.stopTracking(party_id, discord_id);

      return res.json({
        success: true,
        message: 'Tracking stopped',
      });
    } catch (error) {
      console.error('Error stopping tracking:', error);
      return res.status(500).json({ error: 'Failed to stop tracking' });
    }
  }
);

/**
 * GET /api/audius/progress/:partyId/:discordId
 * Get listening progress for a participant
 */
router.get(
  '/progress/:partyId/:discordId',
  validate({
    params: Joi.object({
      partyId: Joi.string().required(),
      discordId: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response) => {
    try {
      const { partyId, discordId } = req.params;

      const progress = await audiusVerification.getProgress(partyId, discordId);

      if (!progress) {
        return res.status(404).json({ error: 'Participant not found' });
      }

      return res.json(progress);
    } catch (error) {
      console.error('Error getting progress:', error);
      return res.status(500).json({ error: 'Failed to get progress' });
    }
  }
);

export default router;
