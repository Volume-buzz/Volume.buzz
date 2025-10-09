"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { motion } from 'framer-motion';
import AudioPlayer from '@/components/ui/audio-player';
import MagicBento from '@/components/MagicBento';
import { TextureButton } from '@/components/ui/texture-button';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/ui/sortable';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { TokenDropdown } from '@/components/ui/token-dropdown';
import { RaidDynamicIsland } from '@/components/raids/RaidDynamicIsland';
import { PrivyWalletProvider } from '@/components/wallet/privy-provider';
import { useRaid } from '@/contexts/RaidContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, VersionedTransaction, Connection, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { QueuedTrack } from '@/types/raid';

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  product: string;
  images: { url: string }[];
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

function SpotifyPageContent() {
  // Privy and Raid hooks - all hooks must be called unconditionally
  const { user: privyUser, authenticated, ready: privyReady, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { activeRaid, endRaid, createRaid } = useRaid();

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
  const [playerState, setPlayerState] = useState<WebPlaybackState | null>(null);
  const [playerError, setPlayerError] = useState<string>("");

  // Queue management state
  const [queuedTracks, setQueuedTracks] = useState<QueuedTrack[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string>("");
  
  // Raid drawer state
  const [showRaidDrawer, setShowRaidDrawer] = useState(false);
  const [selectedTrackForRaid, setSelectedTrackForRaid] = useState<QueuedTrack | null>(null);
  const [userTokens, setUserTokens] = useState<Array<{mint: string, name: string, symbol: string, balance: number}>>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [tokensPerUser, setTokensPerUser] = useState<number>(10);
  const [maxSeats, setMaxSeats] = useState<number>(10);
  
  // Raid banner state
  const [listeningTime, setListeningTime] = useState(0);
  const [canClaim, setCanClaim] = useState(false);
  const [claiming, setClaiming] = useState(false);

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
        artist: track.artists.map((a: { name: string }) => a.name).join(', ')
      };
    } catch {
      return null;
    }
  }, [getValidToken]);

  useEffect(() => {
    const error = searchParams?.get('error');
    const tokenSuccess = searchParams?.get('token_success');
    const accessToken = searchParams?.get('access_token');
    const refreshToken = searchParams?.get('refresh_token');
    const expiresIn = searchParams?.get('expires_in');
    const userProfile = searchParams?.get('user_profile');
    
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
        initializePlayer();
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

          // Initialize player
          initializePlayer();
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

  // Initialize Web Playback SDK (let Spotify handle Premium requirements)
  const initializePlayer = useCallback(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      console.log("🎵 Spotify Web Playback SDK is ready!");
      
      const player = new window.Spotify!.Player({
        name: 'Volume Dashboard Player',
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const token = await getValidToken();
            cb(token);
          } catch (error) {
            console.error("Failed to get OAuth token:", error);
            setPlayerError("Authentication failed - please reconnect");
          }
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
    if (!deviceId || !playerRef.current) {
      setPlayerError("Web Playback SDK not ready. Please use 'Transfer Here' button first to activate this device.");
      return;
    }

    try {
      const token = await getValidToken();
      setPlayerError(""); // Clear any previous errors

      // Only use Web API to start new tracks (per Spotify documentation)
      // Don't auto-transfer - let user control device switching
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uris: [uri] })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error starting playback:", response.status, errorText);

        if (response.status === 404) {
          setPlayerError("Device not active. Please click 'Transfer Here' to activate this device first.");
        } else if (response.status === 403) {
          setPlayerError("Playback restricted. Make sure you have Spotify Premium and this device is active.");
        } else {
          setPlayerError("Failed to start playback. Try transferring to this device first.");
        }
      } else {
        console.log("✅ Successfully started track:", uri);
      }
    } catch (error) {
      console.error("Error starting playback:", error);
      setPlayerError("Failed to start playback");
    }
  };

  // SDK-based control functions (following Spotify documentation)
  const pausePlayback = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.pause();
      console.log('✅ Paused via SDK');
    } catch (error) {
      console.error("Error pausing via SDK:", error);
      setPlayerError("Failed to pause playback");
    }
  };

  const resumePlayback = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.resume();
      console.log('✅ Resumed via SDK');
    } catch (error) {
      console.error("Error resuming via SDK:", error);
      setPlayerError("Failed to resume playback");
    }
  };

  const togglePlayback = async () => {
    if (!playerRef.current) return;
    try {
      // Activate element for mobile browsers (per SDK docs)
      try {
        await playerRef.current.activateElement();
      } catch (activateError) {
        console.warn("activateElement not needed or failed:", activateError);
      }

      await playerRef.current.togglePlay();
      console.log('✅ Toggled playback via SDK');
    } catch (error) {
      console.error("Error toggling playback via SDK:", error);
      setPlayerError("Failed to toggle playback");
    }
  };

  const nextTrack = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.nextTrack();
      console.log('✅ Next track via SDK');
    } catch (error) {
      console.error("Error skipping track via SDK:", error);
      setPlayerError("Failed to skip track");
    }
  };

  // Get current player state (per SDK docs)
  const getCurrentPlayerState = async () => {
    if (!playerRef.current) return null;
    try {
      return await playerRef.current.getCurrentState();
    } catch (error) {
      console.error("Error getting current state:", error);
      return null;
    }
  };

  // Volume control (per SDK docs)
  const setPlayerVolume = async (volume: number) => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.setVolume(volume);
      console.log(`✅ Volume set to ${volume * 100}%`);
    } catch (error) {
      console.error("Error setting volume:", error);
      setPlayerError("Failed to set volume");
    }
  };

  const previousTrack = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.previousTrack();
      console.log('✅ Previous track via SDK');
    } catch (error) {
      console.error("Error going to previous track via SDK:", error);
      setPlayerError("Failed to go to previous track");
    }
  };

  // Transfer device (only used once when needed)
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

  // Queue management functions
  const clearQueue = () => {
    setQueuedTracks([]);
  };

  const removeFromQueue = (trackId: string) => {
    setQueuedTracks(prev => prev.filter(track => track.id !== trackId));
  };

  const playFromQueue = async (track: QueuedTrack) => {
    if (!connected || !deviceId) {
      setPlayerError("Player not connected");
      return;
    }

    try {
      const token = await getValidToken();
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          uris: [track.uri]
        })
      });

      if (response.ok) {
        console.log(`✅ Playing track: ${track.name}`);
      } else {
        console.error('Failed to play track:', response.statusText);
        setPlayerError("Failed to play track");
      }
    } catch (error) {
      console.error("Error playing track:", error);
      setPlayerError("Failed to play track");
    }
  };

  // Fetch user's tokens when drawer opens
  useEffect(() => {
    async function fetchUserTokens() {
      if (!showRaidDrawer || !privyUser?.wallet?.address) {
        setLoadingTokens(true);
        return;
      }

      try {
        const connection = new Connection('https://api.devnet.solana.com');
        const walletPubkey = new PublicKey(privyUser.wallet.address);

        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        );

        const tokens = [];
        for (const account of tokenAccounts.value) {
          const info = account.account.data.parsed.info;
          const mint = info.mint;
          const balance = info.tokenAmount.uiAmount;

          tokens.push({
            mint,
            name: `Token`,
            symbol: mint.slice(0, 4),
            balance
          });
        }

        setUserTokens(tokens);
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
      } finally {
        setLoadingTokens(false);
      }
    }

    fetchUserTokens();
  }, [showRaidDrawer, privyUser?.wallet?.address]);

  // Raid drawer handlers
  const handleCreateRaid = (track: QueuedTrack) => {
    setSelectedTrackForRaid(track);
    setShowRaidDrawer(true);
  };

  const handleCloseRaidDrawer = () => {
    setShowRaidDrawer(false);
    setSelectedTrackForRaid(null);
    setSelectedToken('');
    setTokensPerUser(10);
    setMaxSeats(10);
  };

  const handleSubmitRaid = async () => {
    if (!selectedTrackForRaid) return;

    if (!selectedToken) {
      alert('Please select a token');
      return;
    }

    if (tokensPerUser <= 0 || maxSeats <= 0) {
      alert('Invalid values');
      return;
    }

    const selectedTokenData = userTokens.find(t => t.mint === selectedToken);
    if (!selectedTokenData) {
      alert('Token not found');
      return;
    }

    const totalNeeded = tokensPerUser * maxSeats;
    if (selectedTokenData.balance < totalNeeded) {
      alert(`Insufficient balance. Need ${totalNeeded} tokens, have ${selectedTokenData.balance}`);
      return;
    }

    // Generate unique raid ID
    const timestamp = Date.now().toString().slice(-6);
    const raidId = `${selectedTrackForRaid.id}_${timestamp}`;

    try {
      console.log('✅ Calling deployed raid escrow program on devnet...');
      console.log('🆔 Generated raid ID:', raidId);

      const { Program, AnchorProvider, BN } = await import('@coral-xyz/anchor');
      const { RAID_PROGRAM_ID, SOLANA_RPC_URL } = await import('@/lib/raid-program');
      const idl = await import('@/lib/idl/raid_escrow.json');

      // Set up connection and program
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

      // Get wallet from window.solana (injected by Privy)
      if (!(window as any).solana) {
        throw new Error('Wallet not found. Please reconnect your wallet.');
      }

      const wallet = (window as any).solana;

      // Create provider
      const provider = new AnchorProvider(
        connection,
        wallet,
        { commitment: 'confirmed' }
      );

      // Initialize program
      const program = new Program(idl as any, provider);

      // Derive PDAs
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(selectedToken);
      const creatorPubkey = new PublicKey(privyUser!.wallet!.address);

      // Get token accounts
      const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

      const creatorTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        creatorPubkey
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        raidEscrowPDA,
        true // Allow PDA
      );

      console.log('📡 Sending transaction to devnet...');

      // Get fresh blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      console.log('🔗 Using blockhash:', blockhash.slice(0, 8) + '...');

      // Call initialize_raid on deployed program
      const tx = await program.methods
        .initializeRaid(
          raidId,
          new BN(tokensPerUser * 1e9), // Convert to lamports
          maxSeats,
          30 // 30 minutes duration
        )
        .accounts({
          raidEscrow: raidEscrowPDA,
          escrowTokenAccount,
          creator: creatorPubkey,
          creatorTokenAccount,
          tokenMint: tokenMintPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc({
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          commitment: 'confirmed',
        });

      console.log('🎉 Raid created on devnet! Transaction:', tx);
      console.log('🔗 View on explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Store in context for UI
      createRaid({
        raidId,
        trackId: selectedTrackForRaid.id,
        trackName: selectedTrackForRaid.name,
        trackArtist: selectedTrackForRaid.artist,
        trackUri: selectedTrackForRaid.uri,
        tokenMint: selectedToken,
        tokenName: selectedTokenData.name,
        tokenSymbol: selectedTokenData.symbol,
        tokensPerParticipant: tokensPerUser,
        maxSeats,
        creatorWallet: privyUser!.wallet!.address,
        claimedCount: 0,
        claimedBy: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000)
      });

      alert(`🎉 Raid created successfully!\n\nView on explorer:\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);
      handleCloseRaidDrawer();

    } catch (err: any) {
      console.error('❌ Raid creation error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check if transaction actually succeeded despite error
      if (err.signature || errorMsg.includes('already been processed')) {
        const txSig = err.signature || 'unknown';
        console.log('⚠️ Transaction may have succeeded despite error');

        // Store raid anyway
        createRaid({
          raidId,
          trackId: selectedTrackForRaid.id,
          trackName: selectedTrackForRaid.name,
          trackArtist: selectedTrackForRaid.artist,
          trackUri: selectedTrackForRaid.uri,
          tokenMint: selectedToken,
          tokenName: selectedTokenData.name,
          tokenSymbol: selectedTokenData.symbol,
          tokensPerParticipant: tokensPerUser,
          maxSeats,
          creatorWallet: privyUser!.wallet!.address,
          claimedCount: 0,
          claimedBy: [],
          createdAt: Date.now(),
          expiresAt: Date.now() + (30 * 60 * 1000)
        });

        alert(`✅ Raid created! (Warning: ${errorMsg})\n\nCheck explorer:\nhttps://explorer.solana.com/tx/${txSig}?cluster=devnet`);
        handleCloseRaidDrawer();
      } else {
        alert(`Failed to create raid: ${errorMsg}`);
      }
    }
  };

  // Raid banner handlers
  const handleJoinRaid = async () => {
    if (!activeRaid) return;
    
    try {
      // Start playing the raid track
      const raidTrackUri = `spotify:track:${activeRaid.trackId}`;
      await playTrack(raidTrackUri);
      
      // Start tracking listening time
      setListeningTime(0);
      const interval = setInterval(() => {
        setListeningTime(prev => {
          const newTime = prev + 1000; // Add 1 second
          // Enable claiming after 30 seconds of listening
          if (newTime >= 30000 && !canClaim) {
            setCanClaim(true);
          }
          return newTime;
        });
      }, 1000);
      
      // Store interval reference for cleanup
      return () => clearInterval(interval);
    } catch (error) {
      console.error('Failed to join raid:', error);
      setPlayerError('Failed to join raid');
    }
  };

  const handleClaimTokens = async () => {
    if (!activeRaid || claiming) return;
    
    setClaiming(true);
    try {
      // TODO: Implement token claiming logic with Solana
      console.log('Claiming tokens for raid:', activeRaid.raidId);
      
      // Simulate claiming delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Reset states after successful claim
      setCanClaim(false);
      setListeningTime(0);
    } catch (error) {
      console.error('Failed to claim tokens:', error);
    } finally {
      setClaiming(false);
    }
  };

  const handleEndRaid = () => {
    if (activeRaid) {
      endRaid();
      setCanClaim(false);
      setListeningTime(0);
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
      <div className="h-full w-full flex items-center justify-center p-8">
        <motion.div
          className="max-w-md w-full bg-white/5 backdrop-blur-2xl border-2 border-[#000000]/40 rounded-3xl p-12 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.2)_inset,0_0_40px_rgba(29,185,84,0.15)]"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Spotify Logo */}
            <motion.div
              className="w-24 h-24 bg-gradient-to-br from-[#1DB954] to-[#1ed760] rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(29,185,84,0.3)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </motion.div>

            {/* Text */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Checking Connection</h2>
              <p className="text-white/60 text-sm">Verifying your Spotify account</p>
            </div>

            {/* Loading Spinner */}
            <div className="flex items-center justify-center gap-3">
              <motion.div
                className="w-6 h-6 border-3 border-[#1DB954]/30 border-t-[#1DB954] rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-white/70 text-sm">Please wait...</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        {err && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 max-w-md w-full p-4 bg-destructive/10 border border-destructive/20 rounded-md backdrop-blur-sm">
            <div className="text-destructive text-sm font-medium">{err}</div>
          </div>
        )}

        <motion.div
          className="max-w-md w-full bg-white/5 backdrop-blur-2xl border-2 border-[#000000]/40 rounded-3xl p-12 shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,0,0,0.2)_inset,0_0_40px_rgba(29,185,84,0.15)]"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Spotify Logo */}
            <motion.div
              className="w-24 h-24 bg-gradient-to-br from-[#1DB954] to-[#1ed760] rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(29,185,84,0.3)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </motion.div>

            {/* Text */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Connect to Spotify</h2>
              <p className="text-white/60 text-sm">Required for music control</p>
            </div>

            {/* Connect Button */}
            <TextureButton
              onClick={connectSpotify}
              variant="accent"
              size="lg"
              className="w-full"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect with Spotify
            </TextureButton>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto md:overflow-hidden" data-spotify-page>
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      
      {/* Raid Dynamic Island */}
      <RaidDynamicIsland
        onJoinRaid={handleJoinRaid}
        listeningTime={listeningTime}
        canClaim={canClaim}
        onClaimTokens={handleClaimTokens}
        claiming={claiming}
        onEndRaid={handleEndRaid}
      />
      
      <div className="w-full h-auto md:h-full flex flex-col">
        {(err || playerError) && (
          <div className="m-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="text-destructive text-sm font-medium">{err || playerError}</div>
          </div>
        )}

        <div className="w-full flex-1 flex items-start md:items-center justify-center p-0 md:p-4 max-w-none">
          <MagicBento
            textAutoHide={true}
            enableStars={false}
            enableSpotlight={true}
            enableBorderGlow={true}
            disableAnimations={false}
            spotlightRadius={400}
            enableTilt={false}
            clickEffect={false}
            enableMagnetism={false}
            simpleLayout
            className="spotify-layout"
          >
          {/* Control Center Card - Merged Profile + Play by Link */}
          <motion.div
            className="card card--border-glow control-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="card__header">
              <div className="flex items-center gap-3 min-w-0">
                {user?.images?.[0]?.url && (
                  <div className="relative">
                    <img
                      src={user.images[0].url}
                      alt={user.display_name}
                      className="w-10 h-10 rounded-full ring-2 ring-[#1DB954]/30"
                    />
                    {user?.product === 'premium' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#1DB954] rounded-full border-2 border-[#060010]"></div>
                    )}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold truncate text-sm">{user?.display_name || 'Spotify User'}</div>
                  {user?.product === 'premium' ? (
                    <span className="text-[10px] text-[#1DB954] font-medium">Premium</span>
                  ) : (
                    <span className="text-[10px] text-white/70">Free</span>
                  )}
                </div>
              </div>
              <TextureButton
                onClick={disconnectSpotify}
                variant="destructive"
                size="sm"
                aria-label="Logout"
                className="w-auto !h-8"
              >
                Logout
              </TextureButton>
            </div>
            <div className="card__content mt-4">
              <div className="space-y-3">
                <div className="relative">
                  <input
                    id="spotify-url"
                    type="text"
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                    placeholder="Paste Spotify track link..."
                    className="w-full px-4 py-2.5 pl-10 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-[#1DB954]/50 focus:border-[#1DB954] text-white placeholder-white/40 focus:outline-none text-sm transition-all shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
                    onKeyDown={(e) => e.key === 'Enter' && playUrlDirectly()}
                  />
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </div>
                {urlError && <p className="text-xs text-red-400 px-1">{urlError}</p>}
                <div className="flex gap-2">
                  <TextureButton
                    onClick={playUrlDirectly}
                    disabled={!connected || !spotifyUrl.trim()}
                    variant="accent"
                    size="default"
                    className="flex-1"
                  >
                    Play Now
                  </TextureButton>
                  <TextureButton
                    onClick={handleUrlSubmit}
                    disabled={!connected || !spotifyUrl.trim()}
                    variant="secondary"
                    size="default"
                    className="w-auto"
                  >
                    Add to Queue
                  </TextureButton>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Player Card */}
          <motion.div
            className="card card--border-glow player"
            style={{ height: 'auto', minHeight: 420 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="card__content">
              <AudioPlayer
                className=""
                cover={playerState?.track_window?.current_track?.album?.images?.[0]?.url}
                title={playerState?.track_window?.current_track?.name}
                artist={playerState?.track_window?.current_track?.artists?.map(a => a.name).join(', ')}
                album={playerState?.track_window?.current_track?.album?.name}
                deviceName={playerState?.device?.name || (ready ? 'Volume Dashboard Player' : undefined)}
                isPlaying={!playerState?.paused}
                progressMs={playerState?.position}
                durationMs={playerState?.duration}
                onTogglePlay={togglePlayback}
                onPrev={previousTrack}
                onNext={nextTrack}
                onTransfer={transferToThisDevice}
                onSeekMs={async (ms: number) => {
                  try {
                    if (playerRef.current) {
                      await playerRef.current.seek(ms);
                    }
                  } catch (e) {
                    console.error('Seek failed', e);
                  }
                }}
                controlsDisabled={!ready}
              />
            </div>
          </motion.div>

          {/* Queue Card */}
          <motion.div
            className="card card--border-glow queue"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="card__header">
              {queuedTracks.length > 0 && (
                <TextureButton onClick={clearQueue} variant="destructive" size="sm" className="w-auto !h-8 ml-auto">
                  Clear All
                </TextureButton>
              )}
            </div>
            <div className="card__content">
              {queuedTracks.length === 0 ? (
                <div className="grid place-items-center text-white/70 text-sm text-center px-4" style={{ minHeight: 100 }}>
                  <div>
                    <p className="font-medium text-white">No songs in queue</p>
                    <p className="text-white/60 mt-1">Add tracks using Spotify links above</p>
                  </div>
                </div>
              ) : (
                <Sortable
                  value={queuedTracks}
                  onValueChange={setQueuedTracks}
                  getItemValue={(track) => track.id}
                  className="w-full flex-1 min-h-0 self-stretch h-full space-y-2 overflow-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20"
                >
                  {queuedTracks.map((track, index) => (
                    <SortableItem key={track.id} value={track.id}>
                      <div className="group w-full flex items-center justify-between gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-200">
                        <SortableItemHandle className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing">
                            <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            <span className="text-xs text-white/40 font-mono w-6">#{index + 1}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-white truncate text-sm">{track.name}</div>
                            <div className="text-xs text-white/60 truncate">{track.artist}</div>
                          </div>
                        </SortableItemHandle>
                        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <TextureButton
                            onClick={() => playFromQueue(track)}
                            disabled={!connected}
                            variant="accent"
                            size="icon"
                            title="Play track"
                            className="w-auto"
                          >
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </TextureButton>
                          <button
                            onClick={() => handleCreateRaid(track)}
                            title="Start raid for this track"
                            className="w-auto px-3 py-1.5 rounded-lg border border-[#1DB954]/30 bg-gradient-to-b from-[#1DB954] to-[#1aa34a] text-white text-xs font-semibold transition duration-300 ease-in-out hover:from-[#1ed760] hover:to-[#1DB954] active:from-[#1aa34a] active:to-[#188f3f] shadow-sm"
                          >
                            Raid
                          </button>
                          <TextureButton
                            onClick={() => removeFromQueue(track.id)}
                            variant="destructive"
                            size="icon"
                            title="Remove from queue"
                            className="w-auto"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </TextureButton>
                        </div>
                      </div>
                    </SortableItem>
                  ))}
                </Sortable>
              )}
            </div>
          </motion.div>
        </MagicBento>
        </div>
      </div>

      {/* Raid Creation Drawer */}
      <Drawer open={showRaidDrawer} onOpenChange={setShowRaidDrawer}>
        <DrawerContent className="bg-white/5 backdrop-blur-2xl border-2 border-[#000000]/40 shadow-[0_20px_60px_rgba(0,0,0,0.6)] max-h-[85vh]">
          <div className="mx-auto w-full max-w-lg p-6">
            <DrawerHeader className="px-0">
              <DrawerTitle className="text-white text-xl font-bold">Start Raid</DrawerTitle>
              <DrawerDescription className="text-white/60">
                {selectedTrackForRaid && (
                  <div className="mt-2 p-3 bg-white/5 rounded-lg">
                    <div className="font-medium text-white">{selectedTrackForRaid.name}</div>
                    <div className="text-sm">{selectedTrackForRaid.artist}</div>
                  </div>
                )}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-4 mt-4">
              {/* Token Selection */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Select Token
                </label>
                <TokenDropdown
                  options={userTokens.map(token => ({
                    value: token.mint,
                    label: `${token.name} (${token.symbol})`,
                    balance: token.balance,
                    symbol: token.symbol
                  }))}
                  value={selectedToken}
                  onChange={setSelectedToken}
                  placeholder="Select a token..."
                  loading={loadingTokens}
                />
              </div>

              {/* Tokens Per Participant */}
              <div>
                <label htmlFor="tokens-per-user" className="block text-sm font-medium text-white mb-2">
                  Tokens Per Participant
                </label>
                <input
                  id="tokens-per-user"
                  type="number"
                  value={tokensPerUser}
                  onChange={(e) => setTokensPerUser(Number(e.target.value))}
                  min="1"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-[#1DB954]/50 focus:border-[#1DB954] text-white placeholder-white/40 focus:outline-none text-sm transition-all"
                />
              </div>

              {/* Max Participants */}
              <div>
                <label htmlFor="max-seats" className="block text-sm font-medium text-white mb-2">
                  Max Participants
                </label>
                <input
                  id="max-seats"
                  type="number"
                  value={maxSeats}
                  onChange={(e) => setMaxSeats(Number(e.target.value))}
                  min="1"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-[#1DB954]/50 focus:border-[#1DB954] text-white placeholder-white/40 focus:outline-none text-sm transition-all"
                />
              </div>

              {/* Summary */}
              {selectedToken && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm">
                  <div className="text-blue-300">
                    <strong>Total tokens needed:</strong> {tokensPerUser * maxSeats}
                  </div>
                </div>
              )}
            </div>

            <DrawerFooter className="px-0 mt-6">
              <TextureButton
                onClick={handleSubmitRaid}
                variant="accent"
                size="default"
                className="w-full"
                disabled={!selectedToken || loadingTokens}
              >
                Create Raid
              </TextureButton>
              <DrawerClose asChild>
                <TextureButton
                  variant="secondary"
                  size="default"
                  className="w-full"
                >
                  Cancel
                </TextureButton>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
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