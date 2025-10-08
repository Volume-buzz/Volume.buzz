"use client";
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { RaidCreationModal } from '@/components/raids/RaidCreationModal';
import { RaidBanner } from '@/components/raids/RaidBanner';
import { PrivyWalletProvider } from '@/components/wallet/privy-provider';
import { useRaid } from '@/contexts/RaidContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, VersionedTransaction, Connection, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  product: string;
  images: { url: string }[];
}

interface QueuedTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  addedAt: number;
}

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

function SpotifyPageContent() {
  // Privy and Raid hooks - all hooks must be called unconditionally
  const { user: privyUser, authenticated, ready: privyReady, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { activeRaid, endRaid } = useRaid();

  // Solana-specific hooks - these are safe to call unconditionally in PrivyWalletProvider
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

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

  // Queue management state
  const [queuedTracks, setQueuedTracks] = useState<QueuedTrack[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string>("");

  // Raid creation state
  const [showRaidModal, setShowRaidModal] = useState(false);
  const [selectedTrackForRaid, setSelectedTrackForRaid] = useState<QueuedTrack | null>(null);

  // Raid participation state
  const [listeningTime, setListeningTime] = useState<number>(0);
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<boolean>(false);

  const seqRef = useRef(0);
  const playerRef = useRef<any>(null);
  const searchParams = useSearchParams();

  // Utility functions
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

  const getTrackFromSpotify = async (trackId: string): Promise<{name: string, artist: string} | null> => {
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
  };

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
    if (tokenSuccess && accessToken && userProfile) {
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
      
      // Store user profile
      try {
        const profile = JSON.parse(decodeURIComponent(userProfile));
        localStorage.setItem('spotify_user_profile', JSON.stringify(profile));
        setUser(profile);
        setConnected(true);
        
        // Initialize player if Premium
        if (profile.product === 'premium') {
          initializePlayer();
        }
        
        setErr(null);
      } catch (parseError) {
        console.error('Failed to parse user profile:', parseError);
        setErr('Failed to parse user profile');
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

      if (accessToken && userProfile) {
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

        // Validate token with Spotify API
        const testResponse = await fetch('https://api.spotify.com/v1/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (testResponse.ok) {
          const profile = JSON.parse(userProfile);
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

  // Player control functions
  const pausePlayback = async () => {
    if (!deviceId) return;
    try {
      const token = await getValidToken();
      await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error("Error pausing playback:", error);
      setPlayerError("Failed to pause playback");
    }
  };

  const resumePlayback = async () => {
    if (!deviceId) return;
    try {
      const token = await getValidToken();
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error("Error resuming playback:", error);
      setPlayerError("Failed to resume playback");
    }
  };

  // Track listening time for raid participation
  // MUST be before any conditional returns to follow Rules of Hooks
  useEffect(() => {
    if (!activeRaid || !privyUser?.wallet?.address) return;

    // Reset timer when raid changes
    console.log('🔄 Starting listening timer for raid:', activeRaid.raidId);
    setListeningTime(0);
    setCanClaim(false);

    const interval = setInterval(() => {
      if (playerRef.current) {
        playerRef.current.getCurrentState().then((state: any) => {
          if (state && !state.paused) {
            const position = Math.floor(state.position / 1000);
            setListeningTime(position);
            console.log('⏱️ Listening time:', position, 'seconds');

            // Enable claim button after 5 seconds (reduced for testing)
            if (position >= 5) {
              setCanClaim(true);
              console.log('🎉 5 seconds reached! You can claim your tokens now!');
            }
          } else if (state?.paused) {
            console.log('⏸️ Player is paused, timer not incrementing');
          }
        });
      }
    }, 1000); // Update every second

    return () => {
      console.log('🛑 Stopping listening timer for raid:', activeRaid.raidId);
      clearInterval(interval);
    };
  }, [activeRaid?.raidId, privyUser?.wallet?.address]);

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

  // Handle joining a raid
  const handleJoinRaid = async () => {
    console.log('🎯 Join raid clicked!', {
      hasRaid: !!activeRaid,
      hasWallet: !!privyUser?.wallet?.address,
      authenticated,
      playerReady: ready,
      deviceId,
      activeRaid: activeRaid ? { trackName: activeRaid.trackName, trackUri: activeRaid.trackUri } : null
    });

    if (!activeRaid) {
      alert('No active raid found!');
      return;
    }

    // Check authentication and prompt wallet connection if needed
    if (!authenticated) {
      console.log('🔐 User not authenticated, prompting login...');
      await login();
      return;
    }

    // Check if wallet is connected
    if (!privyUser?.wallet?.address) {
      console.log('👛 No wallet connected, prompting connection...');
      await connectWallet();
      return;
    }

    // Check if Solana wallet is available
    if (solanaWallets.length === 0) {
      console.log('⚠️ No Solana wallet found. Prompting wallet connection...');
      alert('Please connect a Solana wallet to join the raid.');
      await connectWallet();
      return;
    }

    if (!ready || !deviceId) {
      alert('Spotify player is not ready. Please make sure you have Spotify Premium and the player is initialized.');
      return;
    }

    console.log('✅ All checks passed, starting raid listening...');

    // Start playing the raid track (no need to "join", just start listening)
    try {
      const token = await getValidToken();
      console.log('📡 Requesting Spotify to play:', activeRaid.trackUri);

      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uris: [activeRaid.trackUri]
        })
      });

      if (response.ok) {
        console.log('✅ Playing raid track:', activeRaid.trackName);
        setListeningTime(0);
        setCanClaim(false);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to play track. Status:', response.status, 'Response:', errorText);
        alert(`Failed to play track: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('❌ Error playing track:', error);
      alert(`Error playing track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle claiming tokens after completing raid
  const handleClaimTokens = async () => {
    if (!activeRaid) {
      console.log('Cannot claim tokens: No active raid');
      return;
    }

    // Check if user is authenticated
    if (!authenticated) {
      console.log('🔐 User not authenticated, prompting login...');
      await login();
      return;
    }

    // Check if wallet is connected
    if (!privyUser?.wallet?.address) {
      console.log('👛 No wallet connected, prompting connection...');
      await connectWallet();
      return;
    }

    // Check if Solana wallet is available
    if (solanaWallets.length === 0) {
      console.log('⚠️ No Solana wallet found. Prompting wallet connection...');
      alert('Please connect a Solana wallet first. Click OK to connect.');
      await connectWallet();
      return;
    }

    setClaiming(true);
    console.log('🎁 Claiming raid tokens via deployed program...');

    try {
      // Dynamic imports
      const { Program, AnchorProvider, BN } = await import('@coral-xyz/anchor');
      const { RAID_PROGRAM_ID, SOLANA_RPC_URL } = await import('@/lib/raid-program');
      const idl = await import('@/lib/idl/raid_escrow.json');

      // Get wallet adapter
      const walletAdapter = getWalletAdapter();
      if (!walletAdapter) {
        throw new Error('No compatible Solana wallet found. Please try connecting your wallet again.');
      }

      console.log('✅ Wallet adapter ready:', walletAdapter.publicKey.toBase58());

      // Setup connection
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

      // Create provider
      const provider = new AnchorProvider(
        connection,
        walletAdapter,
        { commitment: 'confirmed' }
      );

      // Initialize program
      const program = new Program(idl as any, provider);

      // Use the stored raid ID (must match what was used in creation)
      const raidId = activeRaid.raidId;

      // Derive PDAs
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(activeRaid.tokenMint);
      const participantPubkey = walletAdapter.publicKey;

      // Get escrow token account
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        raidEscrowPDA,
        true // Allow PDA
      );

      // Get participant token account
      const participantTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        participantPubkey
      );

      console.log('📡 Calling claim_tokens on devnet program...');
      console.log('  Raid ID:', raidId);
      console.log('  Raid PDA:', raidEscrowPDA.toBase58());
      console.log('  Participant:', participantPubkey.toBase58());

      // Check if raid still exists on-chain
      try {
        await program.account.raidEscrow.fetch(raidEscrowPDA);
      } catch (err) {
        throw new Error('Raid no longer exists on-chain (may have expired or been closed)');
      }

      // Get fresh blockhash to avoid transaction deduplication
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      // Call claim_tokens on deployed program
      const tx = await program.methods
        .claimTokens(raidId)
        .accounts({
          raidEscrow: raidEscrowPDA,
          escrowTokenAccount,
          participant: participantPubkey,
          participantTokenAccount,
          tokenMint: tokenMintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc({
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

      console.log('🎉 Tokens claimed successfully!');
      console.log('🔗 Transaction:', tx);
      console.log('🔗 View on explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Reset claim state
      setCanClaim(false);
      setClaiming(false);

      // Show success message
      alert(`✅ Successfully claimed ${activeRaid.tokensPerParticipant} ${activeRaid.tokenSymbol}!\n\nTransaction: ${tx}\n\nView on explorer:\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);

    } catch (error) {
      console.error('❌ Token claim failed:', error);
      setClaiming(false);
      alert(`Failed to claim tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Handle ending raid - calls on-chain close_raid to return unclaimed tokens
  const handleEndRaid = async () => {
    if (!activeRaid) return;

    // Check if user is the creator
    const userWallet = privyUser?.wallet?.address;
    if (!userWallet || userWallet !== activeRaid.creatorWallet) {
      // Not the creator, just clear locally
      endRaid();
      return;
    }

    const confirmed = confirm('End this raid and return unclaimed tokens to your wallet?');
    if (!confirmed) return;

    try {
      console.log('🛑 Ending raid and closing escrow...');

      const { Program, AnchorProvider } = await import('@coral-xyz/anchor');
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const { RAID_PROGRAM_ID, SOLANA_RPC_URL } = await import('@/lib/raid-program');
      const idl = await import('@/lib/idl/raid_escrow.json');

      const walletAdapter = getWalletAdapter();
      if (!walletAdapter) {
        throw new Error('No wallet connected');
      }

      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const provider = new AnchorProvider(connection, walletAdapter, { commitment: 'confirmed' });
      const program = new Program(idl as any, provider);

      const raidId = activeRaid.raidId;
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(activeRaid.tokenMint);
      const creatorPubkey = new PublicKey(userWallet);

      const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

      const creatorTokenAccount = await getAssociatedTokenAddress(tokenMintPubkey, creatorPubkey);
      const escrowTokenAccount = await getAssociatedTokenAddress(tokenMintPubkey, raidEscrowPDA, true);

      // Check if raid still exists on-chain
      try {
        await program.account.raidEscrow.fetch(raidEscrowPDA);
      } catch (err) {
        // Raid doesn't exist, just clear UI
        console.log('⚠️ Raid already closed or expired, clearing UI only');
        endRaid();
        return;
      }

      console.log('📡 Calling close_raid...');

      const tx = await program.methods
        .closeRaid(raidId)
        .accounts({
          raidEscrow: raidEscrowPDA,
          escrowTokenAccount,
          creator: creatorPubkey,
          creatorTokenAccount,
          tokenMint: tokenMintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc({
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

      console.log('✅ Raid closed! Transaction:', tx);

      alert(`✅ Raid closed! Unclaimed tokens returned to your wallet.\n\nTransaction:\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Clear local state
      endRaid();
    } catch (error) {
      console.error('❌ Failed to close raid:', error);
      alert(`Failed to close raid: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Get wallet adapter using useMemo to prevent hook order issues
  const getWalletAdapter = () => {
    console.log('🔍 Finding compatible Solana wallet...');
    console.log('Available wallets:', {
      solanaWallets: solanaWallets.map(w => ({ address: w.address, type: w.walletClientType }))
    });

    // Try to use Privy's standard Solana wallet first
    if (solanaWallets.length > 0) {
      const solanaWallet = solanaWallets[0];
      console.log('✅ Using Privy standard Solana wallet:', solanaWallet.walletClientType);

      return {
        publicKey: new PublicKey(solanaWallet.address),
        signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
          console.log('📝 Signing transaction with Privy standard wallet...');

          try {
            // Serialize based on transaction type
            let serializedTransaction: Uint8Array;
            if (transaction instanceof VersionedTransaction) {
              serializedTransaction = transaction.serialize();
            } else {
              serializedTransaction = transaction.serialize({ requireAllSignatures: false });
            }

            // Use Privy's sign transaction method - this will prompt the user
            console.log('🎯 Requesting wallet signature - this should prompt your wallet!');
            const result = await signTransaction({
              transaction: serializedTransaction,
              wallet: solanaWallet
            });

            console.log('✅ Transaction signed by Privy standard wallet:', result);

            // Reconstruct based on transaction type
            if (transaction instanceof VersionedTransaction) {
              return VersionedTransaction.deserialize(result.signedTransaction) as T;
            } else {
              return Transaction.from(result.signedTransaction) as T;
            }
          } catch (error) {
            console.error('❌ Privy standard wallet signing failed:', error);
            throw error;
          }
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
          console.log('📝 Signing multiple transactions...');
          const signed = [];
          for (const tx of transactions) {
            let serializedTransaction: Uint8Array;
            if (tx instanceof VersionedTransaction) {
              serializedTransaction = tx.serialize();
            } else {
              serializedTransaction = tx.serialize({ requireAllSignatures: false });
            }

            const result = await signTransaction({
              transaction: serializedTransaction,
              wallet: solanaWallet
            });

            if (tx instanceof VersionedTransaction) {
              signed.push(VersionedTransaction.deserialize(result.signedTransaction) as T);
            } else {
              signed.push(Transaction.from(result.signedTransaction) as T);
            }
          }
          return signed;
        }
      };
    }

    console.error('❌ No compatible Solana wallet found');
    return null;
  };

  return (
    <div>
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />

      {/* Raid Banner */}
      <RaidBanner
        onJoinRaid={handleJoinRaid}
        listeningTime={listeningTime}
        canClaim={canClaim}
        onClaimTokens={handleClaimTokens}
        claiming={claiming}
        onEndRaid={handleEndRaid}
      />

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

          {/* Current Track */}
          {trackName && (
            <div className="p-6 bg-card rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground">Now Playing</h2>
                <div className="flex items-center gap-2">
                  {paused ? (
                    <button
                      onClick={resumePlayback}
                      disabled={!ready}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                    >
                      ▶️ Play
                    </button>
                  ) : (
                    <button
                      onClick={pausePlayback}
                      disabled={!ready}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2"
                    >
                      ⏸️ Pause
                    </button>
                  )}
                  <button
                    onClick={transferToThisDevice}
                    disabled={!deviceId}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    📱 Transfer Here
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-lg font-medium text-foreground">{trackName}</div>
                  <div className="text-sm text-muted-foreground">{artistName}</div>
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
                      {activeRaid && activeRaid.trackId === track.id && privyUser?.wallet?.address === activeRaid.creatorWallet ? (
                        <button
                          onClick={() => endRaid()}
                          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                        >
                          🛑 End Raid
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedTrackForRaid(track);
                            setShowRaidModal(true);
                          }}
                          disabled={!!activeRaid}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🎯 Raid
                        </button>
                      )}
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

      {/* Raid Creation Modal */}
      {showRaidModal && selectedTrackForRaid && (
        <RaidCreationModal
          track={selectedTrackForRaid}
          onClose={() => {
            setShowRaidModal(false);
            setSelectedTrackForRaid(null);
          }}
        />
      )}
    </div>
  );
}

export default function SpotifyPage() {
  return (
    <PrivyWalletProvider>
      <SpotifyPageContent />
    </PrivyWalletProvider>
  );
}