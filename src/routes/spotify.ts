import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate, commonSchemas } from '../middleware/validation';
import SpotifyAuthService from '../services/spotify/SpotifyAuthService';
import SpotifyApiService from '../services/spotify/SpotifyApiService';
import config from '../config/environment';
import Joi from 'joi';

const router: Router = Router();

const authService = new SpotifyAuthService({
  clientId: config.spotify.clientId,
  clientSecret: config.spotify.clientSecret,
  redirectUri: config.spotify.redirectUri
});
const apiService = new SpotifyApiService(authService, { clientId: config.spotify.clientId, clientSecret: config.spotify.clientSecret });

// Provide a short-lived access token for Web Playback SDK
router.get('/token', requireAuth, async (req: Request, res: Response) => {
  try {
    const discordId = req.sessionUser!.discordId;
    const access = await authService.getValidAccessToken(discordId);
    if (!access) return res.status(401).json({ error: 'Not authenticated with Spotify' });
    return res.json({ access_token: access });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get token' });
  }
});

router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const devices = await apiService.getUserDevices(req.sessionUser!.discordId);
    return res.json({ devices });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load devices' });
  }
});

router.post('/play', 
  requireAuth, 
  validate({
    body: Joi.object({
      spotifyUri: commonSchemas.spotifyUri,
      deviceId: commonSchemas.deviceId
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { spotifyUri, deviceId } = req.body;
      const ok = await apiService.startTrackPlayback(req.sessionUser!.discordId, spotifyUri, deviceId);
      if (!ok) return res.status(400).json({ error: 'Playback failed' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to start playback' });
    }
  }
);

router.post('/pause', 
  requireAuth, 
  validate({
    body: Joi.object({
      deviceId: commonSchemas.deviceId
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.body;
      const ok = await apiService.pausePlayback(req.sessionUser!.discordId, deviceId);
      if (!ok) return res.status(400).json({ error: 'Pause failed' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to pause' });
    }
  }
);

router.post('/queue', 
  requireAuth, 
  validate({
    body: Joi.object({
      spotifyUri: commonSchemas.spotifyUri,
      deviceId: commonSchemas.deviceId
    })
  }),
  async (req: Request, res: Response) => {
    try {
      const { spotifyUri, deviceId } = req.body;
      const ok = await apiService.addToQueue(req.sessionUser!.discordId, spotifyUri, deviceId);
      if (!ok) return res.status(400).json({ error: 'Queue failed' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to queue' });
    }
  }
);

export default router;
