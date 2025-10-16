"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import MagicBento from '@/components/MagicBento';
import { RaidCreationModal } from '@/components/raids/RaidCreationModal';
import { RaidDynamicIsland } from '@/components/raids/RaidDynamicIsland';
import { PrivyWalletProvider } from '@/components/wallet/privy-provider';
import { useRaid } from '@/contexts/RaidContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import Script from 'next/script';

interface QueuedTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  addedAt: number;
  permalink?: string;
  artwork?: string;
}

// Audius API types
interface AudiusTrack {
  id: string;
  title: string;
  permalink: string;
  user: {
    id: string;
    name: string;
    handle: string;
  };
  duration: number;
  artwork?: {
    '150x150': string;
    '480x480': string;
    '1000x1000': string;
  };
}

// Audius OAuth user type
interface AudiusUser {
  userId: number;
  email: string;
  name: string;
  handle: string;
  verified: boolean;
  profilePicture: {
    '150x150': string;
    '480x480': string;
    '1000x1000': string;
  } | null;
  apiKey: string | null;
}

// Extend window type for Audius SDK
declare global {
  interface Window {
    audiusSdk: any;
  }
}

function AudiusPageContent() {
  // Privy and Raid hooks
  const { user: privyUser, authenticated, ready: privyReady, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { activeRaid, endRaid } = useRaid();

  // Solana-specific hooks
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

  // Audius state
  const [queuedTracks, setQueuedTracks] = useState<QueuedTrack[]>([]);
  const [audiusUrl, setAudiusUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string>("");
  const [currentTrack, setCurrentTrack] = useState<QueuedTrack | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const sdkRef = useRef<any>(null);

  // Audius OAuth state
  const [audiusUser, setAudiusUser] = useState<AudiusUser | null>(null);
  const [audiusConnected, setAudiusConnected] = useState(false);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState<string>("");

  // Raid creation state
  const [showRaidModal, setShowRaidModal] = useState(false);
  const [selectedTrackForRaid, setSelectedTrackForRaid] = useState<QueuedTrack | null>(null);

  // Raid participation state
  const [listeningTime, setListeningTime] = useState<number>(0);
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<boolean>(false);
  const lastListeningTimeRef = useRef<number>(-1); // Track previous value to prevent unnecessary re-renders

  // Initialize Audius SDK with OAuth (using browser CDN)
  useEffect(() => {
    const initSDK = () => {
      // Wait for SDK to load from CDN
      const checkSDK = setInterval(() => {
        if (window.audiusSdk) {
          clearInterval(checkSDK);

          try {
            // Get API key from environment
            const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY;

            console.log('🔍 Environment check:', {
              apiKeyDefined: !!apiKey,
              apiKeyLength: apiKey?.length || 0,
              apiKeyPreview: apiKey ? apiKey.substring(0, 8) + '...' : 'UNDEFINED',
              allEnvVars: Object.keys(process.env).filter(k => k.includes('AUDIUS'))
            });

            if (!apiKey) {
              console.error('❌ NEXT_PUBLIC_AUDIUS_API_KEY is not set!');
              console.error('Available env vars:', Object.keys(process.env));
              throw new Error('Audius API key not configured - check Railway environment variables');
            }

            console.log('🔑 Initializing Audius SDK with API key:', apiKey.substring(0, 8) + '...');

            const audiusSdk = window.audiusSdk({
              apiKey: apiKey
            });

            console.log('📡 Audius SDK instance created, initializing OAuth...');

            // Initialize OAuth
            audiusSdk.oauth.init({
              successCallback: (user: AudiusUser) => {
                console.log('✅ Audius OAuth success:', user);
                setAudiusUser(user);
                setAudiusConnected(true);
                // Store in localStorage
                localStorage.setItem('audius_user', JSON.stringify(user));
              },
              errorCallback: (error: Error) => {
                console.error('❌ Audius OAuth error:', error);
                console.error('Error details:', error);
                setAudiusConnected(false);
              }
            });

            sdkRef.current = audiusSdk;
            setSdkReady(true);
            console.log('✅ Audius SDK ready with OAuth');

            // Check for existing OAuth session
            const savedUser = localStorage.getItem('audius_user');
            if (savedUser) {
              try {
                const user = JSON.parse(savedUser);
                setAudiusUser(user);
                setAudiusConnected(true);
                console.log('✅ Restored Audius session:', user.handle);
              } catch (e) {
                console.error('Failed to restore Audius session:', e);
                localStorage.removeItem('audius_user');
              }
            }
          } catch (error) {
            console.error('Failed to initialize Audius SDK:', error);
            // Fallback to direct API without OAuth
            setSdkReady(true);
            console.log('⚠️ Using direct API fallback (no OAuth)');
          }
        }
      }, 100);

      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkSDK);
        if (!sdkReady) {
          console.warn('⚠️ Audius SDK did not load, using direct API');
          setSdkReady(true);
        }
      }, 10000);
    };

    initSDK();
  }, [sdkReady]);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";

    // Event listeners for audio element
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      console.log('🎵 Audio loaded, duration:', audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('play', () => {
      setIsPlaying(true);
      console.log('▶️ Audio started playing');
    });

    audio.addEventListener('pause', () => {
      setIsPlaying(false);
      console.log('⏸️ Audio paused');
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      console.log('🏁 Audio ended');
    });

    audio.addEventListener('error', (e) => {
      console.error('❌ Audio error:', e);
      setPlayerError('Failed to load audio stream');
      setIsPlaying(false);
    });

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audio.remove();
    };
  }, []);

  // Load queue from localStorage on component mount
  useEffect(() => {
    const savedQueue = localStorage.getItem('audius_queue');
    if (savedQueue) {
      try {
        setQueuedTracks(JSON.parse(savedQueue));
      } catch {
        localStorage.removeItem('audius_queue');
      }
    }
  }, []);

  // Save queue to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('audius_queue', JSON.stringify(queuedTracks));
  }, [queuedTracks]);

  // Extract track ID from Audius URL
  const extractTrackId = (url: string): string | null => {
    try {
      // Match track ID from embed URLs: https://audius.co/embed/track/Q47QxBW
      const embedMatch = url.match(/audius\.co\/embed\/track\/([^\/\?]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }

      // Match permalink from regular URLs: https://audius.co/artist/track-slug
      const permalinkMatch = url.match(/audius\.co\/([^\/]+)\/([^\/\?]+)/);
      if (permalinkMatch) {
        // Return the full permalink path for resolve endpoint
        return `/${permalinkMatch[1]}/${permalinkMatch[2]}`;
      }

      return null;
    } catch {
      return null;
    }
  };

  // Fetch track metadata from Audius using official API
  const getTrackFromAudius = async (trackIdOrPermalink: string): Promise<AudiusTrack | null> => {
    try {
      console.log('🔍 Fetching track from Audius API:', trackIdOrPermalink);

      const apiHost = 'https://api.audius.co';
      const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY || '06ac216cd5916caeba332a0223469e28782a612eebc972a5c432efdc86aa78b9';

      let response;

      // Check if it's a direct track ID (from embed) or a permalink
      if (trackIdOrPermalink.startsWith('/')) {
        // It's a permalink - use resolve endpoint
        console.log('📍 Using resolve endpoint for permalink:', trackIdOrPermalink);
        response = await fetch(`${apiHost}/v1/resolve?url=https://audius.co${trackIdOrPermalink}&app_name=VOLUME`, {
          headers: {
            'Accept': 'application/json',
            'X-API-Key': apiKey
          }
        });
      } else {
        // It's a direct track ID - use tracks endpoint
        console.log('🆔 Using tracks endpoint for ID:', trackIdOrPermalink);
        response = await fetch(`${apiHost}/v1/tracks/${trackIdOrPermalink}?app_name=VOLUME`, {
          headers: {
            'Accept': 'application/json',
            'X-API-Key': apiKey
          }
        });
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      // Handle different response formats
      let track;
      if (data?.data) {
        track = Array.isArray(data.data) ? data.data[0] : data.data;
      }

      if (track) {
        console.log('✅ Found track:', track.title);
        return {
          id: track.id,
          title: track.title,
          permalink: track.permalink,
          user: {
            id: track.user.id,
            name: track.user.name,
            handle: track.user.handle
          },
          duration: track.duration,
          artwork: track.artwork
        };
      }

      console.warn('Track not found on Audius');
      return null;
    } catch (error) {
      console.error('Error fetching track from Audius:', error);
      return null;
    }
  };

  // Handle URL submit to add to queue
  const handleUrlSubmit = async () => {
    setUrlError("");

    console.log("🔍 handleUrlSubmit called with audiusUrl:", audiusUrl);

    if (!audiusUrl.trim()) {
      setUrlError("Please enter an Audius URL");
      return;
    }

    if (!sdkReady) {
      setUrlError("Audius SDK is not ready yet. Please wait a moment and try again.");
      return;
    }

    const permalink = extractTrackId(audiusUrl);
    console.log("📍 Extracted permalink:", permalink);
    if (!permalink) {
      setUrlError("Invalid Audius URL. Please use a track link from Audius.");
      return;
    }

    try {
      // Fetch track metadata from Audius
      const trackInfo = await getTrackFromAudius(permalink);
      console.log("📦 Fetched track info:", trackInfo);
      if (!trackInfo) {
        setUrlError("Could not fetch track information. Please check the URL.");
        return;
      }

      // Allow same track to be added multiple times - use timestamp to differentiate
      const newTrack: QueuedTrack = {
        id: trackInfo.id,
        uri: audiusUrl,
        name: trackInfo.title,
        artist: trackInfo.user.name,
        addedAt: Date.now(),
        permalink: trackInfo.permalink,
        artwork: trackInfo.artwork?.['150x150'] || ''
      };

      console.log("➕ Adding track to queue:", newTrack);
      setQueuedTracks(prev => [...prev, newTrack]);
      setAudiusUrl("");
      console.log("✅ Track added to queue:", newTrack.name);
    } catch (error) {
      console.error("Error adding track:", error);
      setUrlError("Failed to add track. Please try again.");
    }
  };

  // Get stream URL from Audius API
  const getStreamUrl = (trackId: string): string => {
    const apiHost = 'https://api.audius.co';
    const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY || '06ac216cd5916caeba332a0223469e28782a612eebc972a5c432efdc86aa78b9';

    // Return the stream URL directly - the audio element will handle the redirect to the content node
    // This avoids CSP issues with fetch() since the browser's native audio loading uses media-src
    return `${apiHost}/v1/tracks/${trackId}/stream?app_name=VOLUME&api_key=${apiKey}`;
  };

  // Play track from queue
  const playFromQueue = async (track: QueuedTrack) => {
    if (!audioRef.current) {
      setPlayerError("Audio player not ready");
      return;
    }

    try {
      setPlayerError("");
      console.log("🎵 Loading track:", track.name);

      // Get stream URL - the browser will handle redirects to content nodes
      const streamUrl = getStreamUrl(track.id);

      // Set current track and load audio
      setCurrentTrack(track);
      audioRef.current.src = streamUrl;
      await audioRef.current.play();

      console.log("✅ Now playing:", track.name);
    } catch (error) {
      console.error("Error playing track:", error);
      setPlayerError("Failed to play track");
    }
  };

  // Playback control functions
  const togglePlaybackRef = useRef<boolean>(false);
  const togglePlayback = async () => {
    if (!audioRef.current) {
      console.error('❌ Audio ref not available');
      return;
    }

    // Prevent rapid-fire toggles
    if (togglePlaybackRef.current) {
      console.log('⚠️ Toggle already in progress, ignoring');
      return;
    }

    togglePlaybackRef.current = true;

    try {
      // Get the actual paused state from the audio element itself
      const isPaused = audioRef.current.paused;
      console.log('🎵 Toggle playback - current paused state:', isPaused, 'isPlaying state:', isPlaying);

      if (isPaused) {
        console.log('▶️ Attempting to play...');
        await audioRef.current.play();
      } else {
        console.log('⏸️ Attempting to pause...');
        audioRef.current.pause();
      }
    } catch (error) {
      console.error("❌ Error toggling playback:", error);
      setPlayerError("Playback control failed");
    } finally {
      // Reset lock after a short delay
      setTimeout(() => {
        togglePlaybackRef.current = false;
      }, 300);
    }
  };

  const seekTo = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Audius OAuth functions
  const handleAudiusLogin = async () => {
    if (!sdkRef.current) {
      console.error('Audius SDK not ready');
      return;
    }

    try {
      // Trigger OAuth login popup
      await sdkRef.current.oauth.login({ scope: 'read' });
      console.log('🔐 Audius OAuth login initiated');
    } catch (error) {
      console.error('Failed to initiate Audius login:', error);
      alert('Failed to connect to Audius. Please try again.');
    }
  };

  const handleAudiusLogout = () => {
    setAudiusUser(null);
    setAudiusConnected(false);
    localStorage.removeItem('audius_user');
    console.log('🔐 Logged out of Audius');
  };

  // Remove track from queue
  const removeFromQueue = (trackId: string) => {
    setQueuedTracks(prev => prev.filter(track => track.id !== trackId));
  };

  // Clear entire queue
  const clearQueue = () => {
    setQueuedTracks([]);
  };

  // Track listening time for raid participation (matching Spotify implementation)
  useEffect(() => {
    if (!activeRaid || !privyUser?.wallet?.address) return;

    // Reset timer when raid changes
    console.log('🔄 Starting listening timer for raid:', activeRaid.raidId);
    setListeningTime(0);
    setCanClaim(false);
    lastListeningTimeRef.current = -1; // Reset tracking ref

    const interval = setInterval(() => {
      // Check if audio is playing
      if (audioRef.current && !audioRef.current.paused) {
        const position = Math.floor(audioRef.current.currentTime);

        // Only update state if value has actually changed
        if (position !== lastListeningTimeRef.current) {
          setListeningTime(position);
          lastListeningTimeRef.current = position;
          console.log('⏱️ Listening time:', position, 'seconds');

          // Enable claim button after 5 seconds (matching Spotify exactly)
          if (position >= 5 && !canClaim) {
            setCanClaim(true);
            console.log('🎉 5 seconds reached! You can claim your tokens now!');
          }
        }
      } else if (audioRef.current?.paused) {
        console.log('⏸️ Player is paused, timer not incrementing');
      }
    }, 1000); // Update every second

    return () => {
      console.log('🛑 Stopping listening timer for raid:', activeRaid.raidId);
      clearInterval(interval);
    };
  }, [activeRaid?.raidId, privyUser?.wallet?.address]);

  // Handle joining a raid
  const handleJoinRaid = useCallback(async () => {
    console.log('🎯 Join raid clicked!', {
      hasRaid: !!activeRaid,
      hasWallet: !!privyUser?.wallet?.address,
      authenticated,
      activeRaid: activeRaid ? { trackName: activeRaid.trackName, trackUri: activeRaid.trackUri, trackId: activeRaid.trackId } : null
    });

    if (!activeRaid) {
      alert('No active raid found!');
      return;
    }

    if (!authenticated) {
      console.log('🔐 User not authenticated, prompting login...');
      await login();
      return;
    }

    if (!privyUser?.wallet?.address) {
      console.log('👛 No wallet connected, prompting connection...');
      await connectWallet();
      return;
    }

    if (solanaWallets.length === 0) {
      console.log('⚠️ No Solana wallet found. Prompting wallet connection...');
      alert('Please connect a Solana wallet to join the raid.');
      await connectWallet();
      return;
    }

    console.log('✅ All checks passed, starting raid listening...');

    // Fetch full track info to get artwork
    let raidTrack: QueuedTrack = {
      id: activeRaid.trackId,
      uri: activeRaid.trackUri,
      name: activeRaid.trackName,
      artist: activeRaid.trackArtist,
      addedAt: Date.now()
    };

    // Try to fetch artwork from Audius API
    try {
      const trackInfo = await getTrackFromAudius(activeRaid.trackId);
      if (trackInfo?.artwork) {
        raidTrack.artwork = trackInfo.artwork['150x150'];
        console.log('✅ Fetched artwork for raid track');
      }
    } catch (error) {
      console.warn('Failed to fetch raid track artwork:', error);
      // Continue without artwork
    }

    // Use playFromQueue to start playing
    await playFromQueue(raidTrack);
    console.log('🎵 Started playing raid track:', activeRaid.trackName);
  }, [activeRaid, authenticated, privyUser, solanaWallets, login, connectWallet]);

  // Handle claiming tokens
  const handleClaimTokens = useCallback(async () => {
    if (!activeRaid) {
      console.log('Cannot claim tokens: No active raid');
      return;
    }

    if (!authenticated) {
      console.log('🔐 User not authenticated, prompting login...');
      await login();
      return;
    }

    if (!privyUser?.wallet?.address) {
      console.log('👛 No wallet connected, prompting connection...');
      await connectWallet();
      return;
    }

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
      const { Program, AnchorProvider } = await import('@coral-xyz/anchor');
      const { RAID_PROGRAM_ID, SOLANA_RPC_URL } = await import('@/lib/raid-program');
      const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
      const idl = await import('@/lib/idl/raid_escrow.json');

      // Get wallet adapter
      const walletAdapter = getWalletAdapter();
      if (!walletAdapter) {
        throw new Error('No compatible Solana wallet found.');
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

      const raidId = activeRaid.raidId;

      // Derive PDAs
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(activeRaid.tokenMint);
      const participantPubkey = walletAdapter.publicKey;

      // Get token accounts
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        raidEscrowPDA,
        true
      );

      const participantTokenAccount = await getAssociatedTokenAddress(
        tokenMintPubkey,
        participantPubkey
      );

      // Check if participant token account exists, create if not
      const participantAccountInfo = await connection.getAccountInfo(participantTokenAccount);
      if (!participantAccountInfo) {
        console.log('📦 Creating participant token account...');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          participantPubkey,
          participantTokenAccount,
          participantPubkey,
          tokenMintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const createTx = new Transaction().add(createAtaIx);
        const { blockhash } = await connection.getLatestBlockhash();
        createTx.recentBlockhash = blockhash;
        createTx.feePayer = participantPubkey;

        const signedCreateTx = await walletAdapter.signTransaction(createTx);
        const createSig = await connection.sendRawTransaction(signedCreateTx.serialize());
        await connection.confirmTransaction(createSig, 'confirmed');
        console.log('✅ Created participant token account:', createSig);
      }

      console.log('📡 Calling claim_tokens on devnet program...');

      // Check if raid exists on-chain
      try {
        await program.account.raidEscrow.fetch(raidEscrowPDA);
      } catch (err) {
        throw new Error('Raid no longer exists on-chain');
      }

      // Claim tokens
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

      setCanClaim(false);
      setClaiming(false);

      alert(`✅ Successfully claimed ${activeRaid.tokensPerParticipant} ${activeRaid.tokenSymbol}!\n\nView on explorer:\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);

    } catch (error) {
      console.error('❌ Token claim failed:', error);
      setClaiming(false);
      alert(`Failed to claim tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [activeRaid, authenticated, privyUser, solanaWallets, login, connectWallet]);

  // Handle ending raid - calls on-chain close_raid to return unclaimed tokens
  const handleEndRaid = useCallback(async () => {
    if (!activeRaid) return;

    // Check if user is the creator
    const userWallet = privyUser?.wallet?.address;
    if (!userWallet || userWallet !== activeRaid.creatorWallet) {
      // Not the creator, just clear locally
      console.log('🧹 Clearing raid state locally (not creator)');

      // Clear listening state
      setListeningTime(0);
      setCanClaim(false);
      lastListeningTimeRef.current = -1;

      // Clear from context (which updates localStorage)
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

        // Clear listening state
        setListeningTime(0);
        setCanClaim(false);
        lastListeningTimeRef.current = -1;

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

      // Clear listening state
      setListeningTime(0);
      setCanClaim(false);
      lastListeningTimeRef.current = -1;

      // Clear local state
      endRaid();
    } catch (error: any) {
      console.error('❌ Failed to close raid:', error);

      // Check if transaction actually succeeded despite the error
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes('already been processed') || errorMsg.includes('Transaction simulation failed')) {
        // Transaction likely succeeded, check if the raid is closed on-chain
        console.log('⚠️ Transaction may have succeeded despite error');

        try {
          // Re-import to get SOLANA_RPC_URL in this scope
          const { RAID_PROGRAM_ID: programId, SOLANA_RPC_URL: rpcUrl } = await import('@/lib/raid-program');
          const connection = new Connection(rpcUrl, 'confirmed');
          const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('raid'), Buffer.from(activeRaid.raidId)],
            programId
          );

          // Try to fetch the raid account
          const { Program, AnchorProvider } = await import('@coral-xyz/anchor');
          const idl = await import('@/lib/idl/raid_escrow.json');
          const walletAdapter = getWalletAdapter();

          if (walletAdapter) {
            const provider = new AnchorProvider(connection, walletAdapter, { commitment: 'confirmed' });
            const program = new Program(idl as any, provider);

            try {
              await program.account.raidEscrow.fetch(raidEscrowPDA);
              // Raid still exists, the error was real
              alert(`Failed to close raid: ${errorMsg}`);
            } catch {
              // Raid doesn't exist anymore - transaction succeeded!
              console.log('✅ Raid successfully closed (verified on-chain)');
              alert(`✅ Raid closed successfully! Unclaimed tokens have been returned to your wallet.`);

              // Clear listening state
              setListeningTime(0);
              setCanClaim(false);
              lastListeningTimeRef.current = -1;

              endRaid();
            }
          }
        } catch (verifyErr) {
          console.error('Failed to verify raid status:', verifyErr);
          alert(`Transaction status unclear: ${errorMsg}\n\nPlease check your wallet and Solana Explorer to verify.`);
        }
      } else {
        // Different error
        alert(`Failed to close raid: ${errorMsg}`);
      }
    }
  }, [activeRaid, privyUser, endRaid]);

  // Get wallet adapter
  const getWalletAdapter = () => {
    if (solanaWallets.length > 0) {
      const solanaWallet = solanaWallets[0];

      return {
        publicKey: new PublicKey(solanaWallet.address),
        signTransaction: async (transaction: any) => {
          const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
          const result = await signTransaction({
            transaction: serializedTransaction,
            wallet: solanaWallet
          });
          return Transaction.from(result.signedTransaction);
        }
      };
    }

    return null;
  };

  // Show OAuth gate if not connected (matching Spotify flow)
  if (!audiusConnected) {
    return (
      <div>
        {/* Load Audius SDK from CDN */}
        <Script src="https://cdn.jsdelivr.net/npm/web3@latest/dist/web3.min.js" strategy="beforeInteractive" />
        <Script src="https://cdn.jsdelivr.net/npm/@audius/sdk@latest/dist/sdk.min.js" strategy="beforeInteractive" />

        <div className="h-full w-full flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-card border-2 rounded-3xl p-12 shadow-2xl">
            <div className="flex flex-col items-center text-center space-y-8">
              {/* Audius Logo/Icon */}
              <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-lg">
                <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
              </div>

              {/* Text */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-foreground">Connect to Audius</h2>
                <p className="text-muted-foreground text-sm">Required for music streaming</p>
              </div>

              {/* Connect Button */}
              <button
                onClick={handleAudiusLogin}
                disabled={!sdkReady}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
              >
                {!sdkReady ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Loading SDK...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                    </svg>
                    Connect with Audius
                  </>
                )}
              </button>

              {/* Info */}
              <div className="text-xs text-muted-foreground">
                <p>By connecting, you'll be able to:</p>
                <ul className="mt-2 space-y-1 text-left">
                  <li>• Stream decentralized music</li>
                  <li>• Create and join raids</li>
                  <li>• Support independent artists</li>
                  <li>• Earn token rewards</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto md:overflow-hidden" data-audius-page>
      {/* Load Audius SDK from CDN */}
      <Script src="https://cdn.jsdelivr.net/npm/web3@latest/dist/web3.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/@audius/sdk@latest/dist/sdk.min.js" strategy="beforeInteractive" />

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
            className="audius-layout"
          >
            {/* Control Center Card - Profile + URL Input + OAuth Status */}
            <motion.div
              className="card card--border-glow control-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="card__header">
                <div className="flex items-center gap-3 min-w-0">
                  {audiusUser?.profilePicture ? (
                    <img
                      src={audiusUser.profilePicture['150x150']}
                      alt={audiusUser.handle}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                      A
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">
                      {audiusUser ? `@${audiusUser.handle}` : 'Audius'}
                    </div>
                    {audiusUser?.verified && (
                      <span className="text-[10px] text-blue-400 font-medium">Verified</span>
                    )}
                  </div>
                </div>
                {audiusUser && (
                  <button
                    onClick={handleAudiusLogout}
                    className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors font-medium"
                  >
                    Logout
                  </button>
                )}
              </div>

              <div className="card__content mt-4">
                <div className="space-y-4">
                  {/* Audius URL Input */}
                  <div>
                    <label htmlFor="audius-url" className="block text-sm font-medium text-white/80 mb-2">
                      Audius Track URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="audius-url"
                        type="text"
                        value={audiusUrl}
                        onChange={(e) => setAudiusUrl(e.target.value)}
                        placeholder="https://audius.co/artist/track-name"
                        className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
                      />
                      <button
                        onClick={handleUrlSubmit}
                        disabled={!audiusUrl.trim()}
                        className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                    {urlError && (
                      <p className="mt-2 text-sm text-red-300">{urlError}</p>
                    )}
                  </div>

                  {/* Connection Status */}
                  {sdkReady && (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-green-400">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="font-medium">SDK Ready</span>
                      </div>
                      {audiusUser && (
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-sm text-white/60">
                            Logged in as @{audiusUser.handle}
                            {audiusUser.verified && <span className="text-blue-400 ml-1">✓</span>}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Player Card - Only show when we have a current track */}
            {currentTrack && (
              <motion.div
                className="card card--border-glow player"
                style={{ height: 'auto', minHeight: 420 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <div className="card__content">
                  {/* Track artwork and info */}
                  <div className="mb-4 flex items-center gap-4">
                    {currentTrack.artwork && (
                      <img
                        src={currentTrack.artwork}
                        alt={currentTrack.name}
                        className="w-20 h-20 rounded-lg shadow-lg"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white mb-1 truncate">
                        {currentTrack.name}
                      </h3>
                      <p className="text-white/60 truncate">
                        {currentTrack.artist}
                      </p>
                    </div>
                  </div>

                  {/* Player error */}
                  {playerError && (
                    <div className="mb-3 p-2 bg-red-500/20 border border-red-500/30 rounded-md">
                      <div className="text-red-300 text-sm">{playerError}</div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-2 mb-4">
                    <div
                      className="relative h-2 bg-white/10 rounded-full overflow-hidden cursor-pointer"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = x / rect.width;
                        seekTo(percentage * duration);
                      }}
                    >
                      <div
                        className="absolute h-full bg-purple-500 transition-all"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-white/60">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Playback Controls */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={togglePlayback}
                      className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white flex items-center justify-center transition-all shadow-lg"
                    >
                      {isPlaying ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Hidden audio element */}
                  <audio ref={audioRef} className="hidden" />
                </div>
              </motion.div>
            )}

            {/* Queue Card */}
            <motion.div
              className="card card--border-glow queue"
              style={{ maxHeight: '600px', display: 'flex', flexDirection: 'column' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <div className="card__header" style={{ flexShrink: 0 }}>
                <div className="flex items-center justify-between w-full">
                  <h2 className="text-lg font-bold text-white">Track Queue</h2>
                  {queuedTracks.length > 0 && (
                    <button
                      onClick={clearQueue}
                      className="text-sm text-red-400 hover:text-red-300 font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <div className="card__content" style={{ overflowY: 'auto', flex: 1 }}>
                {queuedTracks.length === 0 ? (
                  <div className="text-center py-8 text-white/60">
                    <div className="text-2xl mb-2">🎵</div>
                    <p>No tracks in queue</p>
                    <p className="text-sm">Add tracks using Audius links above</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {queuedTracks.map((track, index) => (
                      <div
                        key={`${track.id}-${track.addedAt}`}
                        className={`p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ${
                          currentTrack?.id === track.id && currentTrack?.addedAt === track.addedAt ? 'ring-2 ring-purple-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Track artwork */}
                          {track.artwork && (
                            <img
                              src={track.artwork}
                              alt={track.name}
                              className="w-12 h-12 rounded-md flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{track.name}</p>
                            <p className="text-white/60 text-sm truncate">{track.artist}</p>
                          </div>
                          <div className="flex gap-2">
                            {activeRaid && activeRaid.trackId === track.id && (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs font-medium rounded">
                                Active Raid
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setSelectedTrackForRaid(track);
                                setShowRaidModal(true);
                              }}
                              disabled={!!activeRaid}
                              className="px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Create Raid
                            </button>
                            <button
                              onClick={() => playFromQueue(track)}
                              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded transition-colors"
                            >
                              ▶️
                            </button>
                            <button
                              onClick={() => removeFromQueue(track.id)}
                              className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium rounded transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </MagicBento>
        </div>
      </div>

      {/* Raid Creation Modal */}
      {showRaidModal && selectedTrackForRaid && (
        <RaidCreationModal
          track={selectedTrackForRaid}
          platform="audius"
          onClose={() => {
            setShowRaidModal(false);
            setSelectedTrackForRaid(null);
          }}
        />
      )}
    </div>
  );
}

export default function AudiusPage() {
  return (
    <PrivyWalletProvider>
      <AudiusPageContent />
    </PrivyWalletProvider>
  );
}
