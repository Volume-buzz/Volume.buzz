/**
 * Spotify Embedded Player Service
 * Provides embedded Spotify player for premium users with real-time tracking
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { Server } from 'http';
import SpotifyAuthService from './SpotifyAuthService';
import PrismaDatabase from '../../database/prisma';
import config from '../../config/environment';

interface PlayerSession {
  discordId: string;
  raidId: number;
  trackId: string;
  requiredTime: number;
  startTime: Date;
  totalListenTime: number;
  isActive: boolean;
}

class SpotifyPlayerService {
  private app: express.Application;
  private server: Server | null = null;
  private authService: SpotifyAuthService;
  private activeSessions: Map<string, PlayerSession> = new Map();

  constructor(authService: SpotifyAuthService) {
    this.authService = authService;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // CORS for embedded player
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      next();
    });
  }

  private setupRoutes(): void {
    // Embedded player page
    this.app.get('/player/:discordId/:raidId/:trackId', this.servePlayer.bind(this));
    
    // Player API endpoints
    this.app.post('/api/player/start', this.handlePlayerStart.bind(this));
    this.app.post('/api/player/pause', this.handlePlayerPause.bind(this));
    this.app.post('/api/player/progress', this.handlePlayerProgress.bind(this));
    this.app.get('/api/player/token/:discordId', this.getPlayerToken.bind(this));
  }

  /**
   * Serve the embedded Spotify player page
   */
  private async servePlayer(req: Request, res: Response): Promise<void> {
    try {
      const { discordId, raidId, trackId } = req.params;

      // Validate user is premium
      const isPremium = await this.authService.isUserPremium(discordId);
      if (!isPremium) {
        res.status(403).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #191414; color: white;">
              <h1>🔒 Premium Required</h1>
              <p>The embedded Spotify player is only available for Premium users.</p>
              <p>Upgrade to Spotify Premium to access enhanced tracking!</p>
            </body>
          </html>
        `);
        return;
      }

      // Get raid info
      const raid = await PrismaDatabase.getRaid(parseInt(raidId));
      if (!raid || raid.platform !== 'SPOTIFY') {
        res.status(404).send('Raid not found or not a Spotify raid');
        return;
      }

      const playerHtml = this.generatePlayerHTML(discordId, parseInt(raidId), trackId, raid);
      res.send(playerHtml);

    } catch (error) {
      console.error('Error serving player:', error);
      res.status(500).send('Internal server error');
    }
  }

  /**
   * Generate the embedded player HTML with Spotify Web Playback SDK
   */
  private generatePlayerHTML(discordId: string, raidId: number, trackId: string, raid: any): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Raid Player - ${raid.track_title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #191414 0%, #1DB954 100%);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        
        .player-container {
            background: rgba(25, 20, 20, 0.9);
            border-radius: 15px;
            padding: 30px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        
        .track-info {
            margin-bottom: 30px;
        }
        
        .track-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #1DB954;
        }
        
        .track-artist {
            font-size: 18px;
            color: #B3B3B3;
            margin-bottom: 20px;
        }
        
        .progress-section {
            background: rgba(29, 185, 84, 0.1);
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .progress-bar {
            background: #333;
            border-radius: 10px;
            height: 10px;
            margin: 10px 0;
            overflow: hidden;
        }
        
        .progress-fill {
            background: linear-gradient(90deg, #1DB954, #1ED760);
            height: 100%;
            transition: width 0.3s ease;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        
        .stat-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
        }
        
        .stat-label {
            font-size: 12px;
            color: #B3B3B3;
            margin-bottom: 5px;
        }
        
        .stat-value {
            font-size: 18px;
            font-weight: bold;
        }
        
        .player-controls {
            margin: 20px 0;
        }
        
        button {
            background: #1DB954;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            margin: 0 10px;
            transition: background 0.3s;
        }
        
        button:hover {
            background: #1ED760;
        }
        
        button:disabled {
            background: #333;
            cursor: not-allowed;
        }
        
        .status {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            font-weight: bold;
        }
        
        .status.playing {
            background: rgba(29, 185, 84, 0.2);
            border: 2px solid #1DB954;
        }
        
        .status.paused {
            background: rgba(255, 107, 107, 0.2);
            border: 2px solid #FF6B6B;
        }
        
        .status.qualified {
            background: rgba(0, 255, 0, 0.2);
            border: 2px solid #00FF00;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        
        .listening {
            animation: pulse 2s infinite;
        }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="track-info">
            <div class="track-title">${raid.track_title}</div>
            <div class="track-artist">${raid.track_artist}</div>
            <div style="color: #1DB954; font-weight: bold;">🎯 Raid #${raidId} • Spotify Premium Player</div>
        </div>
        
        <div id="status" class="status paused">
            🔄 Initializing player...
        </div>
        
        <div class="progress-section">
            <div class="stat-label">Listening Progress</div>
            <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
            </div>
            <div id="progress-text">0 / ${raid.required_listen_time} seconds</div>
        </div>
        
        <div class="stats">
            <div class="stat-item">
                <div class="stat-label">Required Time</div>
                <div class="stat-value">${raid.required_listen_time}s</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Reward</div>
                <div class="stat-value">${raid.reward_amount} tokens</div>
            </div>
        </div>
        
        <div class="player-controls">
            <button id="play-btn" onclick="playTrack()">▶️ Play Track</button>
            <button id="pause-btn" onclick="pauseTrack()" disabled>⏸️ Pause</button>
        </div>
        
        <div style="margin-top: 20px; font-size: 12px; color: #B3B3B3;">
            🔒 Premium tracking active • Updates in real-time<br>
            Keep this tab open while listening to ensure accurate tracking
        </div>
    </div>

    <script src="https://sdk.scdn.co/spotify-player.js"></script>
    <script>
        let player = null;
        let device_id = null;
        let currentPosition = 0;
        let listenTime = 0;
        let isPlaying = false;
        let trackingInterval = null;
        
        const discordId = '${discordId}';
        const raidId = ${raidId};
        const trackId = '${trackId}';
        const requiredTime = ${raid.required_listen_time};
        
        window.onSpotifyWebPlaybackSDKReady = () => {
            initializePlayer();
        };
        
        async function initializePlayer() {
            try {
                const token = await getAccessToken();
                
                if (!token) {
                    updateStatus('❌ Authentication failed', 'paused');
                    return;
                }
                
                player = new Spotify.Player({
                    name: 'Audius Discord Bot Player',
                    getOAuthToken: cb => { cb(token); },
                    volume: 0.8
                });

                player.addListener('ready', ({ device_id: id }) => {
                    device_id = id;
                    updateStatus('✅ Ready to play!', 'paused');
                    document.getElementById('play-btn').disabled = false;
                });

                player.addListener('not_ready', ({ device_id }) => {
                    updateStatus('❌ Player not ready', 'paused');
                });

                player.addListener('player_state_changed', state => {
                    if (!state) return;
                    
                    const isCurrentlyPlaying = !state.paused;
                    const currentTrack = state.track_window.current_track;
                    
                    if (currentTrack && currentTrack.id === trackId) {
                        isPlaying = isCurrentlyPlaying;
                        currentPosition = state.position;
                        
                        if (isPlaying) {
                            startTracking();
                            updateStatus('🎵 Listening to raid track...', 'playing listening');
                        } else {
                            stopTracking();
                            updateStatus('⏸️ Playback paused', 'paused');
                        }
                    } else if (isCurrentlyPlaying) {
                        stopTracking();
                        updateStatus('❌ Wrong track playing', 'paused');
                    }
                });

                await player.connect();
                
            } catch (error) {
                console.error('Error initializing player:', error);
                updateStatus('❌ Failed to initialize player', 'paused');
            }
        }
        
        async function getAccessToken() {
            try {
                const response = await fetch(\`/api/player/token/\${discordId}\`);
                const data = await response.json();
                return data.access_token;
            } catch (error) {
                console.error('Error getting access token:', error);
                return null;
            }
        }
        
        async function playTrack() {
            if (!player || !device_id) return;
            
            try {
                await fetch(\`https://api.spotify.com/v1/me/player/play?device_id=\${device_id}\`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': \`Bearer \${await getAccessToken()}\`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        uris: [\`spotify:track:\${trackId}\`]
                    })
                });
                
                document.getElementById('play-btn').disabled = true;
                document.getElementById('pause-btn').disabled = false;
                
            } catch (error) {
                console.error('Error playing track:', error);
                updateStatus('❌ Failed to start playback', 'paused');
            }
        }
        
        async function pauseTrack() {
            if (!player || !device_id) return;
            
            try {
                await fetch(\`https://api.spotify.com/v1/me/player/pause?device_id=\${device_id}\`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': \`Bearer \${await getAccessToken()}\`
                    }
                });
                
                document.getElementById('play-btn').disabled = false;
                document.getElementById('pause-btn').disabled = true;
                
            } catch (error) {
                console.error('Error pausing track:', error);
            }
        }
        
        function startTracking() {
            if (trackingInterval) return;
            
            trackingInterval = setInterval(() => {
                if (isPlaying) {
                    listenTime += 1;
                    updateProgress();
                    sendProgressUpdate();
                }
            }, 1000);
        }
        
        function stopTracking() {
            if (trackingInterval) {
                clearInterval(trackingInterval);
                trackingInterval = null;
            }
        }
        
        function updateProgress() {
            const percentage = Math.min((listenTime / requiredTime) * 100, 100);
            
            document.getElementById('progress-fill').style.width = percentage + '%';
            document.getElementById('progress-text').textContent = \`\${listenTime} / \${requiredTime} seconds\`;
            
            if (listenTime >= requiredTime) {
                updateStatus('🎉 Qualified! You can claim rewards when the raid ends!', 'qualified');
                stopTracking();
            }
        }
        
        async function sendProgressUpdate() {
            try {
                await fetch('/api/player/progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        discordId,
                        raidId,
                        listenTime,
                        isPlaying
                    })
                });
            } catch (error) {
                console.error('Error sending progress update:', error);
            }
        }
        
        function updateStatus(text, className = '') {
            const statusEl = document.getElementById('status');
            statusEl.textContent = text;
            statusEl.className = 'status ' + className;
        }
        
        // Initialize on load
        if (window.Spotify) {
            initializePlayer();
        }
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            stopTracking();
            if (player) {
                player.disconnect();
            }
        });
    </script>
</body>
</html>
    `;
  }

  /**
   * Handle player start event
   */
  private async handlePlayerStart(req: Request, res: Response): Promise<void> {
    try {
      const { discordId, raidId, trackId } = req.body;
      
      const sessionKey = `${discordId}-${raidId}`;
      const session = this.activeSessions.get(sessionKey);
      
      if (session) {
        session.isActive = true;
        session.startTime = new Date();
      } else {
        const raid = await PrismaDatabase.getRaid(raidId);
        if (raid) {
          this.activeSessions.set(sessionKey, {
            discordId,
            raidId,
            trackId,
            requiredTime: raid.required_listen_time,
            startTime: new Date(),
            totalListenTime: 0,
            isActive: true
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error handling player start:', error);
      res.status(500).json({ error: 'Failed to start tracking' });
    }
  }

  /**
   * Handle player pause event
   */
  private async handlePlayerPause(req: Request, res: Response): Promise<void> {
    try {
      const { discordId, raidId } = req.body;
      
      const sessionKey = `${discordId}-${raidId}`;
      const session = this.activeSessions.get(sessionKey);
      
      if (session) {
        session.isActive = false;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error handling player pause:', error);
      res.status(500).json({ error: 'Failed to pause tracking' });
    }
  }

  /**
   * Handle player progress updates
   */
  private async handlePlayerProgress(req: Request, res: Response): Promise<void> {
    try {
      const { discordId, raidId, listenTime, isPlaying } = req.body;
      
      // Update database with real-time progress
      await PrismaDatabase.updateRaidParticipant(raidId, discordId, {
        total_listen_duration: listenTime,
        is_listening: isPlaying,
        qualified: listenTime >= ((await PrismaDatabase.getRaid(raidId))?.required_listen_time || 30),
        last_check: new Date()
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error handling progress update:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  }

  /**
   * Get access token for player
   */
  private async getPlayerToken(req: Request, res: Response): Promise<void> {
    try {
      const { discordId } = req.params;
      
      const accessToken = await this.authService.getValidAccessToken(discordId);
      
      if (!accessToken) {
        res.status(401).json({ error: 'No valid access token' });
        return;
      }

      res.json({ access_token: accessToken });
    } catch (error) {
      console.error('Error getting player token:', error);
      res.status(500).json({ error: 'Failed to get access token' });
    }
  }

  /**
   * Generate player URL for a raid participant
   */
  generatePlayerUrl(discordId: string, raidId: number, trackId: string): string {
    const baseUrl = `http://localhost:${config.api.port}`;
    return `${baseUrl}/player/${discordId}/${raidId}/${trackId}`;
  }

  /**
   * Check if user should use embedded player
   */
  async shouldUseEmbeddedPlayer(discordId: string, raidId: number): Promise<boolean> {
    try {
      const user = await PrismaDatabase.getUser(discordId);
      const raid = await PrismaDatabase.getRaid(raidId);
      
      return !!(
        user?.spotify_is_premium && 
        raid?.platform === 'SPOTIFY' && 
        raid?.premium_only
      );
    } catch (error) {
      console.error('Error checking embedded player eligibility:', error);
      return false;
    }
  }

  /**
   * Start the player server (integrated with main OAuth server)
   */
  start(port: number): void {
    if (this.server) return;
    
    this.server = this.app.listen(port + 1, () => {
      console.log(`🎵 Spotify Player server running on port ${port + 1}`);
    });
  }

  /**
   * Stop the player server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('🎵 Spotify Player server stopped');
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return Array.from(this.activeSessions.values()).filter(s => s.isActive).length;
  }
}

export default SpotifyPlayerService;
