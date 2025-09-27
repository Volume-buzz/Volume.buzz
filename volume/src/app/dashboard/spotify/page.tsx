"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  product: 'free' | 'premium';
  images: { url: string }[];
}

interface QueuedTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  addedAt: number;
}

// Official Spotify Web Playback SDK types based on documentation
interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
  enableMediaSession?: boolean;
}

interface WebPlaybackTrack {
  id: string | null;
  uri: string;
  name: string;
  artists: Array<{ name: string; uri: string }>;
  album: {
    name: string;
    uri: string;
    images: Array<{ url: string; height: number; width: number }>;
  };
  duration_ms: number;
}

interface WebPlaybackState {
  device: {
    device_id: string;
    volume: number;
    name: string;
  };
  position: number;
  duration: number;
  paused: boolean;
  shuffle: boolean;
  repeat_mode: 0 | 1 | 2;
  track_window: {
    current_track: WebPlaybackTrack | null;
    previous_tracks: Array<WebPlaybackTrack>;
    next_tracks: Array<WebPlaybackTrack>;
  };
  context: {
    uri: string | null;
    metadata: Record<string, unknown> | null;
  };
}

interface WebPlaybackError {
  message: string;
  type?: string;
}

interface SpotifyPlayer {
  addListener: (event: string, cb: (data: unknown) => void) => void;
  removeListener: (event: string, cb?: (data: unknown) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  getCurrentState: () => Promise<WebPlaybackState | null>;
  setName: (name: string) => Promise<void>;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (position_ms: number) => Promise<void>;
  previousTrack: () => Promise<void>;
  nextTrack: () => Promise<void>;
  activateElement: () => Promise<void>;
}

interface SpotifySDK {
  Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifySDK;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

export default function SpotifyPage() {
  // User and connection state
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Web Playback SDK state
  const [deviceId, setDeviceId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [playerState, setPlayerState] = useState<WebPlaybackState | null>(null);
  const [playerError, setPlayerError] = useState<string>("");

  // Queue management state
  const [queuedTracks, setQueuedTracks] = useState<QueuedTrack[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string>("");

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const searchParams = useSearchParams();

  // Token retrieval function (following Spotify documentation)
  const getValidToken = useCallback(async (): Promise<string> => {
    const accessToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');
    
    if (!accessToken) {
      throw new Error('No access token available');
    }
    
    // Check if token is expired
    if (tokenExpiry && Date.now() > parseInt(tokenExpiry)) {
      // Try to refresh token
      const refreshToken = localStorage.getItem('spotify_refresh_token');
      if (refreshToken) {
        try {
          console.log('🔄 Token expired, attempting refresh...');
          const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '0cbcfab23fce4d88901cb75b610e63b4'
            }),
          });

          if (response.ok) {
            const tokenData = await response.json();
            localStorage.setItem('spotify_access_token', tokenData.access_token);
            
            if (tokenData.refresh_token) {
              localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
            }
            
            const newExpiry = Date.now() + (tokenData.expires_in * 1000);
            localStorage.setItem('spotify_token_expiry', newExpiry.toString());
            
            console.log('✅ Token refreshed successfully');
            return tokenData.access_token;
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }
      
      // If refresh fails, clear storage and throw error
      localStorage.removeItem('spotify_access_token');
      localStorage.removeItem('spotify_refresh_token');
      localStorage.removeItem('spotify_token_expiry');
      localStorage.removeItem('spotify_user_profile');
      throw new Error('Token expired and refresh failed');
    }
    
    return accessToken;
  }, []);

  // Utility functions for queue management
  const extractTrackId = (url: string): string | null => {
    try {
      // Handle various Spotify URL formats
      const patterns = [
        /spotify:track:([a-zA-Z0-9]+)/,
        /spotify\.com\/track\/([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }

      return null;
    } catch {
      return null;
    }
  };

  const getTrackFromSpotify = useCallback(async (trackId: string): Promise<{name: string, artist: string} | null> => {
    try {
      const token = await getValidToken();
      const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) return null;

      const track = await response.json();
      return {
        name: track.name,
        artist: track.artists.map((a: any) => a.name).join(', ')
      };
    } catch {
      return null;
    }
  }, [getValidToken]);

  useEffect(() => {
    const error = searchParams.get('error');
    const tokenSuccess = searchParams.get('token_success');
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');
    const expiresIn = searchParams.get('expires_in');
    const userProfile = searchParams.get('user_profile');
    
    if (error) {
      switch (error) {
        case 'access_denied':
          setErr('Spotify access was denied. Please try connecting again.');
          break;
        case 'state_mismatch':
          setErr('Security verification failed. Please try connecting again.');
          break;
        case 'token_exchange_failed':
          setErr('Failed to complete authentication. Please try again.');
          break;
        default:
          setErr('Authentication failed. Please try again.');
      }
    }

    // Handle successful token exchange
    if (tokenSuccess && accessToken) {
      console.log('🎉 Tokens received from callback, storing in localStorage');
      
      // Store tokens following Spotify documentation
      localStorage.setItem('spotify_access_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('spotify_refresh_token', refreshToken);
      }
      if (expiresIn) {
        const expiryTime = Date.now() + (parseInt(expiresIn) * 1000);
        localStorage.setItem('spotify_token_expiry', expiryTime.toString());
      }
      
      // Store user profile if provided, otherwise fetch client-side
      const setProfileFromJson = (profile: SpotifyUser) => {
        localStorage.setItem('spotify_user_profile', JSON.stringify(profile));
        setUser(profile);
        setConnected(true);
        if (profile.product === 'premium') {
          initializePlayer();
        }
        setErr(null);
      };
      
      if (userProfile) {
        try {
          const profile = JSON.parse(decodeURIComponent(userProfile));
          setProfileFromJson(profile);
        } catch (parseError) {
          console.error('Failed to parse user profile from URL:', parseError);
        }
      } else {
        // Fetch profile using access token
        (async () => {
          try {
            const resp = await fetch('https://api.spotify.com/v1/me', {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (resp.ok) {
              const profile = await resp.json();
              setProfileFromJson(profile);
            } else if (resp.status === 401 || resp.status === 403) {
              console.warn('Profile fetch unauthorized/forbidden. Continuing as free/limited user.');
              const fallbackProfile: SpotifyUser = {
                id: '',
                display_name: 'Spotify User',
                email: '',
                product: 'free',
                images: []
              };
              setProfileFromJson(fallbackProfile);
              setErr('Connected with limited access. Some features require Spotify Premium or tester access.');
            } else {
              console.error('Failed to fetch profile client-side:', resp.status);
              setErr('Failed to fetch profile');
            }
          } catch (e) {
            console.error('Profile fetch error:', e);
            const fallbackProfile: SpotifyUser = {
              id: '',
              display_name: 'Spotify User',
              email: '',
              product: 'free',
              images: []
            };
            setProfileFromJson(fallbackProfile);
            setErr('Connected with limited access. Some features require Spotify Premium or tester access.');
          }
        })();
      }
      
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/spotify');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load queue from localStorage on component mount
  useEffect(() => {
    const savedQueue = localStorage.getItem('spotify_queue');
    if (savedQueue) {
      try {
        setQueuedTracks(JSON.parse(savedQueue));
      } catch {
        // Clear invalid queue data
        localStorage.removeItem('spotify_queue');
      }
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('spotify_queue', JSON.stringify(queuedTracks));
  }, [queuedTracks]);

  useEffect(() => {
    checkSpotifyConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkSpotifyConnection = async () => {
    try {
      // Check localStorage for existing tokens (following Spotify documentation)
      const accessToken = localStorage.getItem('spotify_access_token');
      const userProfile = localStorage.getItem('spotify_user_profile');
      const tokenExpiry = localStorage.getItem('spotify_token_expiry');

      if (accessToken) {
        // Check if token is still valid
        if (tokenExpiry && Date.now() > parseInt(tokenExpiry)) {
          console.log('🔄 Token expired, clearing localStorage');
          localStorage.removeItem('spotify_access_token');
          localStorage.removeItem('spotify_refresh_token');
          localStorage.removeItem('spotify_token_expiry');
          localStorage.removeItem('spotify_user_profile');
          setConnected(false);
          return;
        }

        // Validate token with Spotify API and hydrate profile if missing
        const testResponse = await fetch('https://api.spotify.com/v1/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (testResponse.ok) {
          const profile = userProfile ? JSON.parse(userProfile) : await testResponse.json();
          if (!userProfile) {
            localStorage.setItem('spotify_user_profile', JSON.stringify(profile));
          }
          setUser(profile);
          setConnected(true);
          console.log('✅ Restored session from localStorage:', profile.display_name);
          
          // Initialize player if Premium
          if (profile.product === 'premium') {
            initializePlayer();
          }
        } else if (testResponse.status === 401 || testResponse.status === 403) {
          console.warn('Profile fetch unauthorized/forbidden on resume. Continuing as free/limited user.');
          const fallbackProfile: SpotifyUser = {
            id: '',
            display_name: 'Spotify User',
            email: '',
            product: 'free',
            images: []
          };
          setUser(fallbackProfile);
          setConnected(true);
          setErr('Connected with limited access. Some features require Spotify Premium or tester access.');
        } else {
          console.log('❌ Stored token is invalid or profile fetch failed:', testResponse.status);
          setConnected(false);
        }
      } else {
        setConnected(false);
      }
    } catch (error) {
      console.error('Connection check failed:', error);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Web Playback SDK following official documentation patterns
  const initializePlayer = useCallback(() => {
    if (!user || user.product !== 'premium') {
      console.log("🚫 Skipping player initialization - Premium required");
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log("🎵 Spotify Web Playback SDK is ready!");
      
      const player = new window.Spotify!.Player({
        name: 'Volume Dashboard Player',
        getOAuthToken: (cb: (token: string) => void) => {
          getValidToken()
            .then(token => cb(token))
            .catch(error => {
              console.error("Failed to get OAuth token:", error);
              setPlayerError("Authentication failed - please reconnect");
            });
        },
        volume: 0.8,
        enableMediaSession: true
      });

      playerRef.current = player;

      // Official SDK Error Events
      player.addListener('initialization_error', (data: unknown) => {
        const { message } = data as WebPlaybackError;
        console.error('🚫 Initialization Error:', message);
        setPlayerError(`Player initialization failed: ${message}`);
      });

      player.addListener('authentication_error', (data: unknown) => {
        const { message } = data as WebPlaybackError;
        console.error('🚫 Authentication Error:', message);
        setPlayerError(`Authentication failed: ${message}`);
      });

      player.addListener('account_error', (data: unknown) => {
        const { message } = data as WebPlaybackError;
        console.error('🚫 Account Error:', message);
        setPlayerError(`Account error: ${message}`);
      });

      player.addListener('playback_error', (data: unknown) => {
        const { message } = data as WebPlaybackError;
        console.error('🚫 Playback Error:', message);
        setPlayerError(`Playback failed: ${message}`);
      });

      // Ready Events
      player.addListener('ready', (data: unknown) => {
        const { device_id } = data as { device_id: string };
        console.log('🎵 Ready with Device ID:', device_id);
        setDeviceId(device_id);
        setReady(true);
        setPlayerError("");
      });

      player.addListener('not_ready', (data: unknown) => {
        const { device_id } = data as { device_id: string };
        console.log('🎵 Device ID has gone offline:', device_id);
        setReady(false);
      });

      // Player State Changes
      player.addListener('player_state_changed', (data: unknown) => {
        const state = data as WebPlaybackState | null;
        console.log('🎵 Player state changed:', state);
        setPlayerState(state);
      });

      // Autoplay handling
      player.addListener('autoplay_failed', () => {
        console.warn('🚫 Autoplay blocked by browser - user interaction required');
        setPlayerError("Autoplay blocked - click play to start");
      });

      // Connect the player
      player.connect().then((success: boolean) => {
        if (success) {
          console.log('🎵 Web Playback SDK connected successfully!');
        } else {
          setPlayerError('Failed to connect to Spotify - check your connection');
        }
      });
    };

    // If SDK is already loaded, initialize immediately
    if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }
  }, [user, getValidToken]);

  const connectSpotify = () => {
    window.location.href = '/api/auth/login/spotify';
  };

  const disconnectSpotify = () => {
    // Clear localStorage
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
    localStorage.removeItem('spotify_user_profile');
    
    // Disconnect player
    if (playerRef.current) {
      playerRef.current.disconnect();
    }
    
    // Reset state
    setUser(null);
    setConnected(false);
    setDeviceId(undefined);
    setReady(false);
    setPlayerState(null);
    setPlayerError("");
    setErr(null);
    
    console.log('🔐 Logged out of Spotify');
  };

  // Queue management functions
  const handleUrlSubmit = async () => {
    setUrlError("");

    if (!spotifyUrl.trim()) {
      setUrlError("Please enter a Spotify URL");
      return;
    }

    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) {
      setUrlError("Invalid Spotify URL. Please use a track link from Spotify.");
      return;
    }

    // Check if track already exists in queue
    if (queuedTracks.some(track => track.id === trackId)) {
      setUrlError("This track is already in your queue");
      return;
    }

    try {
      const trackInfo = await getTrackFromSpotify(trackId);
      if (!trackInfo) {
        setUrlError("Could not fetch track information. Please check the URL.");
        return;
      }

      const newTrack: QueuedTrack = {
        id: trackId,
        uri: `spotify:track:${trackId}`,
        name: trackInfo.name,
        artist: trackInfo.artist,
        addedAt: Date.now()
      };

      setQueuedTracks(prev => [...prev, newTrack]);
      setSpotifyUrl("");
      console.log("✅ Track added to queue:", trackInfo.name);
    } catch (error) {
      console.error("Error adding track:", error);
      setUrlError("Failed to add track. Please try again.");
    }
  };

  const playFromQueue = async (track: QueuedTrack) => {
    await playTrack(track.uri);
  };

  const removeFromQueue = (trackId: string) => {
    setQueuedTracks(prev => prev.filter(track => track.id !== trackId));
  };

  const clearQueue = () => {
    setQueuedTracks([]);
  };

  const playUrlDirectly = async () => {
    setUrlError("");

    if (!spotifyUrl.trim()) {
      setUrlError("Please enter a Spotify URL");
      return;
    }

    const trackId = extractTrackId(spotifyUrl);
    if (!trackId) {
      setUrlError("Invalid Spotify URL");
      return;
    }

    await playTrack(`spotify:track:${trackId}`);
    setSpotifyUrl("");
  };

  const playTrack = async (uri: string) => {
    if (!deviceId || !playerRef.current) return;
    try {
      const token = await getValidToken();

      // Activate element first for autoplay
      try {
        await playerRef.current.activateElement();
      } catch (activateError) {
        console.warn("Failed to activate element:", activateError);
      }

      // Ensure this device is active
      await transferToThisDevice();

      // Start playback
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uris: [uri] })
      });

      if (!response.ok) {
        console.error('Failed to start playback:', response.status);
        setPlayerError("Failed to start playback");
      }
    } catch (error) {
      console.error("Error starting playback:", error);
      setPlayerError("Failed to start playback");
    }
  };

  // Player control functions following official SDK patterns
  const transferToThisDevice = useCallback(async () => {
    if (!deviceId) return;
    try {
      const token = await getValidToken();
      const response = await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
      
      if (response.ok) {
        console.log('🎵 Successfully transferred playback to this device');
      } else {
        console.error('Failed to transfer playback:', response.status);
        setPlayerError('Failed to transfer playback to this device');
      }
    } catch (error) {
      console.error("Error transferring playback:", error);
      setPlayerError("Failed to transfer playback");
    }
  }, [deviceId, getValidToken]);


  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4 text-foreground">Spotify</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span>Checking connection...</span>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4 text-foreground">Spotify Integration</h1>
        
        {err && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="text-destructive text-sm font-medium">{err}</div>
          </div>
        )}

        <div className="max-w-md">
          <div className="border rounded-lg p-6 bg-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-[#1DB954] rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Connect to Spotify</h2>
                <p className="text-sm text-muted-foreground">Required for music control</p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#1DB954] rounded-full"></div>
                <span>Control playback across devices</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#1DB954] rounded-full"></div>
                <span>Access your music library</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#1DB954] rounded-full"></div>
                <span>Real-time listening tracking</span>
              </div>
            </div>

            <button
              onClick={connectSpotify}
              className="w-full bg-[#1DB954] hover:bg-[#1DB954]/90 text-white font-medium py-2.5 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect with Spotify
            </button>

            <p className="text-xs text-muted-foreground mt-3 text-center">
              Secure OAuth 2.0 authentication with PKCE
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      
      <div className="container mx-auto px-4 py-8">
        {/* User header */}
        {user && (
          <div className="flex items-center justify-between mb-6 p-4 bg-card rounded-lg border">
            <div className="flex items-center gap-3">
              {user.images?.[0]?.url && (
                <img
                  src={user.images[0].url}
                  alt={user.display_name}
                  className="w-10 h-10 rounded-full border-2 border-green-500"
                />
              )}
              <div>
                <div className="text-lg font-semibold text-foreground">{user.display_name}</div>
                <div className="flex items-center gap-1 text-sm">
                  {user.product === 'premium' ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-green-600 font-medium">Spotify Premium</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                      <span className="text-orange-600 font-medium">Free Account - Limited Features</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Volume Dashboard Player</div>
              <div className="text-xs text-muted-foreground">
                Real-time playback monitoring active
              </div>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold mb-6 text-foreground">🎵 Spotify Web Player</h1>

        {/* Web Playback SDK Disclaimer */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="text-blue-800 dark:text-blue-200 text-sm font-medium mb-1">
            ℹ️ About Spotify Web Playback SDK
          </div>
          <div className="text-blue-700 dark:text-blue-300 text-sm">
            The Spotify Web Playback SDK requires a <strong>Spotify Premium subscription</strong> to function. Free Spotify accounts can connect to view their profile and participate in raids, but playback controls are only available to Premium users as per Spotify&apos;s official requirements.
          </div>
        </div>

        {user && user.product !== 'premium' && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
            <div className="text-amber-800 dark:text-amber-200 text-sm font-medium mb-2">
              🆓 Free Spotify Account Connected
            </div>
            <div className="text-amber-700 dark:text-amber-300 text-sm">
              <strong>What you can do:</strong> Connect to Volume raids and track listening progress<br />
              <strong>What requires Premium:</strong> Web Playback SDK controls (play, pause, volume control) are only available for Spotify Premium subscribers as per Spotify&apos;s official requirements.
            </div>
          </div>
        )}
        
        {(err || playerError) && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="text-destructive text-sm font-medium">{err || playerError}</div>
          </div>
        )}

        <div className="grid gap-6">
          {/* Player Status */}
          <div className="p-6 bg-card rounded-lg border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Player Status</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">SDK:</span>
                <span className={ready ? "text-green-600" : "text-orange-600"}>
                  {ready ? "✅ Ready" : "⏳ Loading..."}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-medium">Device:</span>
                <span className={deviceId ? "text-green-600" : "text-orange-600"}>
                  {deviceId ? `🎵 Connected (${deviceId.slice(0, 8)}...)` : "🔌 Not Ready"}
                </span>
              </div>
              
              {user?.product === 'premium' && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Account:</span>
                  <span className="text-green-600">✅ Premium - Full Web SDK Access</span>
                </div>
              )}
            </div>
          </div>

          {/* Spotify URL Input */}
          <div className="p-6 bg-card rounded-lg border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Play by Spotify Link</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="spotify-url" className="block text-sm font-medium text-foreground mb-2">
                  Paste Spotify track URL
                </label>
                <input
                  id="spotify-url"
                  type="text"
                  value={spotifyUrl}
                  onChange={(e) => setSpotifyUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/... or spotify:track:..."
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                {urlError && (
                  <p className="mt-2 text-sm text-destructive">{urlError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={playUrlDirectly}
                  disabled={!ready || !spotifyUrl.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  ▶️ Play Now
                </button>

                <button
                  onClick={handleUrlSubmit}
                  disabled={!connected || !spotifyUrl.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  ➕ Add to Queue
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Copy track links from Spotify app or web player. Supports various formats including open.spotify.com and spotify: URIs.
              </p>
            </div>
          </div>

          {/* Playback Controls - Premium users only */}
          {user?.product === 'premium' && ready && (
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-4 text-foreground">🎮 Playback Control</h2>
              
              <div className="flex gap-3 mb-4">
                <button 
                  onClick={() => playerRef.current?.togglePlay()}
                  disabled={!ready}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {playerState?.paused ? '▶️ Play' : '⏸️ Pause'}
                </button>
                
                <button 
                  onClick={() => playerRef.current?.previousTrack()}
                  disabled={!ready}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  ⏮️ Previous
                </button>
                
                <button 
                  onClick={() => playerRef.current?.nextTrack()}
                  disabled={!ready}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  ⏭️ Next
                </button>
                
                <button 
                  onClick={transferToThisDevice} 
                  disabled={!deviceId}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  📱 Transfer Here
                </button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Use &quot;Transfer Here&quot; to make this browser your active Spotify device, then control playback directly.
              </p>
            </div>
          )}


          {/* Current Track */}
          {playerState?.track_window?.current_track && (
            <div className="p-6 bg-card rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground">🎵 Now Playing</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => playerRef.current?.togglePlay()}
                    disabled={!ready}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                  >
                    {playerState.paused ? '▶️ Play' : '⏸️ Pause'}
                  </button>
                  <button
                    onClick={transferToThisDevice}
                    disabled={!deviceId}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    📱 Transfer Here
                  </button>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {playerState.track_window.current_track.album.images?.[0] && (
                    <img
                      src={playerState.track_window.current_track.album.images[0].url}
                      alt={playerState.track_window.current_track.album.name}
                      className="w-16 h-16 rounded-md shadow-md"
                    />
                  )}
                  <div className="flex-1">
                    <div className="text-lg font-medium text-foreground">
                      {playerState.track_window.current_track.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      by {playerState.track_window.current_track.artists.map(a => a.name).join(', ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      from {playerState.track_window.current_track.album.name}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">State:</span>
                  <span className={playerState.paused ? "text-orange-600" : "text-green-600"}>
                    {playerState.paused ? "⏸️ Paused" : "▶️ Playing"}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="font-medium">Device:</span>
                  <span className="text-green-600">{playerState.device.name}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{formatTime(playerState.position)}</span>
                    <span>{formatTime(playerState.duration)}</span>
                  </div>
                  
                  {/* Progress bar */}
                  {playerState.duration > 0 && (
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${(playerState.position / playerState.duration) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Song Queue */}
          <div className="p-6 bg-card rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Song Queue</h2>
              {queuedTracks.length > 0 && (
                <button
                  onClick={clearQueue}
                  className="text-sm text-destructive hover:text-destructive/80 font-medium"
                >
                  Clear All
                </button>
              )}
            </div>

            {queuedTracks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-2xl mb-2">🎵</div>
                <p>No songs in queue</p>
                <p className="text-sm">Add tracks using Spotify links above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {queuedTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{track.name}</div>
                      <div className="text-sm text-muted-foreground">{track.artist}</div>
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(track.addedAt).toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">#{index + 1}</span>
                      <button
                        onClick={() => playFromQueue(track)}
                        disabled={!ready}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ▶️ Play
                      </button>
                      <button
                        onClick={() => removeFromQueue(track.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {queuedTracks.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  💡 <strong>Queue saved locally</strong> - Your queue persists between sessions and is ready for raid coordination.
                </p>
              </div>
            )}
          </div>

          {/* Features Info */}
          <div className="p-6 bg-muted/50 rounded-lg border">
            <h3 className="font-semibold mb-3 text-foreground">🎯 Real-time Monitoring Features</h3>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Track progression monitoring</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Track end detection</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Media Session API integration</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Cross-device playback control</span>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-800 dark:text-green-200">
                🚀 <strong>Ready for raid integration!</strong> This player can now be used as a connected device for coordinated music raids with real-time listening validation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}