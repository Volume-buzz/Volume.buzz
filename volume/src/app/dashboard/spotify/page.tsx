"use client";
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  product: string;
  images: { url: string }[];
}

declare global {
  interface Window {
    Spotify: any;
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
  const [trackName, setTrackName] = useState<string>("");
  const [artistName, setArtistName] = useState<string>("");
  const [paused, setPaused] = useState<boolean>(true);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [trackDuration, setTrackDuration] = useState<number>(0);
  const [playerError, setPlayerError] = useState<string>("");

  const seqRef = useRef(0);
  const playerRef = useRef<any>(null);
  const searchParams = useSearchParams();

  // Token retrieval function (following Spotify documentation)
  const getValidToken = async (): Promise<string> => {
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
  };

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
      const setProfileFromJson = (profile: any) => {
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
            } else {
              console.error('Failed to fetch profile client-side:', resp.status);
              setErr('Failed to fetch profile');
            }
          } catch (e) {
            console.error('Profile fetch error:', e);
            setErr('Failed to fetch profile');
          }
        })();
      }
      
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/spotify');
    }
  }, [searchParams]);

  useEffect(() => {
    checkSpotifyConnection();
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
        } else {
          console.log('❌ Stored token is invalid, clearing localStorage');
          localStorage.removeItem('spotify_access_token');
          localStorage.removeItem('spotify_refresh_token');
          localStorage.removeItem('spotify_token_expiry');
          localStorage.removeItem('spotify_user_profile');
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

  // Initialize Web Playback SDK
  const initializePlayer = () => {
    window.onSpotifyWebPlaybackSDKReady = async () => {
      try {
        console.log("🎵 Spotify Web Playback SDK is ready!");
        const token = await getValidToken();
        
        // Create the player
        const player = new window.Spotify.Player({
          name: 'Volume Dashboard Player',
          getOAuthToken: async (cb: (t: string) => void) => {
            try {
              const validToken = await getValidToken();
              cb(validToken);
            } catch (error) {
              console.error("Failed to get valid token:", error);
              setPlayerError("Authentication failed");
            }
          },
          volume: 0.8,
          enableMediaSession: true
        });

        playerRef.current = player;

        // Event listeners
        player.addListener("initialization_error", ({ message }: { message: string }) => {
          console.error("Initialization error:", message);
          setPlayerError(`Initialization Error: ${message}`);
        });

        player.addListener("authentication_error", ({ message }: { message: string }) => {
          console.error("Authentication error:", message);
          setPlayerError(`Authentication Error: ${message}`);
        });

        player.addListener("account_error", ({ message }: { message: string }) => {
          console.error("Account error:", message);
          setPlayerError(`Account Error: ${message}`);
        });

        player.addListener("ready", ({ device_id }: any) => {
          console.log("🎵 Player ready with Device ID:", device_id);
          setDeviceId(device_id);
          setReady(true);
          setPlayerError("");
        });

        player.addListener("not_ready", ({ device_id }: any) => {
          console.log("🎵 Player not ready:", device_id);
          setReady(false);
        });

        player.addListener("player_state_changed", (state: any) => {
          if (!state) return;
          
          const { position, duration, paused: p, track_window } = state;
          
          setPaused(p);
          setCurrentPosition(position);
          setTrackDuration(duration);
          
          if (track_window?.current_track) {
            setTrackName(track_window.current_track.name);
            setArtistName(track_window.current_track.artists?.map((a: any) => a.name).join(", "));
          }

          // Track end detection
          const isNearEnd = duration > 0 && (duration - position) < 1000;
          if (isNearEnd && !p) {
            console.log("🎵 Track ending:", track_window?.current_track?.name);
          }
        });

        // Connect to Spotify
        const success = await player.connect();
        if (success) {
          console.log("🎵 Web Playback SDK connected successfully!");
        } else {
          setPlayerError("Failed to connect to Spotify");
        }
      } catch (error) {
        console.error("Failed to initialize player:", error);
        setPlayerError("Failed to initialize player");
      }
    };

    // If SDK is already loaded, call it immediately
    if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }
  };

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
    setTrackName("");
    setArtistName("");
    setPaused(true);
    setCurrentPosition(0);
    setTrackDuration(0);
    setPlayerError("");
    setErr(null);
    
    console.log('🔐 Logged out of Spotify');
  };

  // Player control functions
  const transferToThisDevice = async () => {
    if (!deviceId) return;
    try {
      const token = await getValidToken();
      await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
    } catch (error) {
      console.error("Error transferring playback:", error);
      setPlayerError("Failed to transfer playback");
    }
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
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ uris: [uri] })
      });
    } catch (error) {
      console.error("Error starting playback:", error);
      setPlayerError("Failed to start playback");
    }
  };

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
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Volume Dashboard Player</div>
                <div className="text-xs text-muted-foreground">
                  Real-time playback monitoring active
                </div>
              </div>
              <button
                onClick={disconnectSpotify}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold mb-6 text-foreground">🎵 Spotify Web Player</h1>

        {user && user.product !== 'premium' && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
            <div className="text-amber-800 dark:text-amber-200 text-sm">
              You are connected with a free Spotify account. Some actions and the Web Playback SDK require Spotify Premium. Upgrade to unlock full functionality.
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

          {/* Playback Controls */}
          {user?.product === 'premium' && (
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Playback Control</h2>
              
              <div className="flex gap-3 mb-4">
                <button 
                  disabled={!ready} 
                  onClick={() => playTrack("spotify:track:11dFghVXANMlKmJXsNCbNl")}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  🎵 Play Demo Track
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
                Use "Transfer Here" to make this browser your active Spotify device, then play music from any Spotify client or use the demo track.
              </p>
            </div>
          )}

          {/* Current Track */}
          {trackName && (
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Now Playing</h2>
              
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-medium text-foreground">{trackName}</div>
                  <div className="text-sm text-muted-foreground">{artistName}</div>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">State:</span>
                  <span className={paused ? "text-orange-600" : "text-green-600"}>
                    {paused ? "⏸️ Paused" : "▶️ Playing"}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{formatTime(currentPosition)}</span>
                    <span>{formatTime(trackDuration)}</span>
                  </div>
                  
                  {/* Progress bar */}
                  {trackDuration > 0 && (
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${(currentPosition / trackDuration) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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