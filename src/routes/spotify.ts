import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import SpotifyAuthService from '../services/spotify/SpotifyAuthService';
import SpotifyApiService from '../services/spotify/SpotifyApiService';
import config from '../config/environment';

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
    const discordId = (req as any).sessionUser.discordId as string;
    const access = await authService.getValidAccessToken(discordId);
    if (!access) return res.status(401).json({ error: 'Not authenticated with Spotify' });
    return res.json({ access_token: access });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get token' });
  }
});

router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const devices = await apiService.getUserDevices((req as any).sessionUser.discordId as string);
    return res.json({ devices });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load devices' });
  }
});

router.post('/play', requireAuth, async (req: Request, res: Response) => {
  try {
    const { spotifyUri, deviceId } = req.body || {};
    if (!spotifyUri) return res.status(400).json({ error: 'spotifyUri required' });
    const ok = await apiService.startTrackPlayback((req as any).sessionUser.discordId as string, spotifyUri, deviceId);
    if (!ok) return res.status(400).json({ error: 'Playback failed' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to start playback' });
  }
});

router.post('/pause', requireAuth, async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.body || {};
    const ok = await apiService.pausePlayback((req as any).sessionUser.discordId as string, deviceId);
    if (!ok) return res.status(400).json({ error: 'Pause failed' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to pause' });
  }
});

router.post('/queue', requireAuth, async (req: Request, res: Response) => {
  try {
    const { spotifyUri, deviceId } = req.body || {};
    if (!spotifyUri) return res.status(400).json({ error: 'spotifyUri required' });
    const ok = await apiService.addToQueue((req as any).sessionUser.discordId as string, spotifyUri, deviceId);
    if (!ok) return res.status(400).json({ error: 'Queue failed' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to queue' });
  }
});

export default router;
