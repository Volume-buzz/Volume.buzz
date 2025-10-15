"use client";
import { useEffect, useState, useRef } from 'react';
import { RaidCreationModal } from '@/components/raids/RaidCreationModal';
import { RaidBanner } from '@/components/raids/RaidBanner';
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
            const audiusSdk = window.audiusSdk({
              appName: 'VOLUME',
              apiKey: process.env.NEXT_PUBLIC_AUDIUS_API_KEY || '06ac216cd5916caeba332a0223469e28782a612eebc972a5c432efdc86aa78b9'
            });

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
        permalink: trackInfo.permalink
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
  const getStreamUrl = async (trackId: string): Promise<string | null> => {
    try {
      const apiHost = 'https://api.audius.co';
      const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY || '06ac216cd5916caeba332a0223469e28782a612eebc972a5c432efdc86aa78b9';

      const response = await fetch(`${apiHost}/v1/tracks/${trackId}/stream?app_name=VOLUME`, {
        headers: {
          'Accept': 'audio/mpeg',
          'X-API-Key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get stream URL: ${response.status}`);
      }

      // The stream endpoint returns the audio file directly
      return response.url;
    } catch (error) {
      console.error('Error getting stream URL:', error);
      return null;
    }
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

      // Get stream URL
      const streamUrl = await getStreamUrl(track.id);
      if (!streamUrl) {
        setPlayerError("Failed to get stream URL");
        return;
      }

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
  const togglePlayback = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        await audioRef.current.play();
      }
    } catch (error) {
      console.error("Error toggling playback:", error);
      setPlayerError("Playback control failed");
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

  // Track listening time for raid participation (similar to Spotify implementation)
  useEffect(() => {
    if (!activeRaid || !privyUser?.wallet?.address) return;

    // Reset timer when raid changes
    console.log('🔄 Starting listening timer for raid:', activeRaid.raidId);
    setListeningTime(0);
    setCanClaim(false);
    lastListeningTimeRef.current = -1; // Reset tracking ref

    const interval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        const position = Math.floor(audioRef.current.currentTime);

        // Only update state if value has actually changed
        if (position !== lastListeningTimeRef.current) {
          setListeningTime(position);
          lastListeningTimeRef.current = position;
          console.log('⏱️ Listening time:', position, 'seconds');

          // Enable claim button after 5 seconds (matching Spotify)
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
  }, [activeRaid?.raidId, privyUser?.wallet?.address, canClaim]);

  // Handle joining a raid
  const handleJoinRaid = async () => {
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

    // Play the raid track directly using the track data from the raid
    const raidTrack: QueuedTrack = {
      id: activeRaid.trackId,
      uri: activeRaid.trackUri,
      name: activeRaid.trackName,
      artist: activeRaid.trackArtist,
      addedAt: Date.now()
    };

    // Use playFromQueue to start playing
    await playFromQueue(raidTrack);
    console.log('🎵 Started playing raid track:', activeRaid.trackName);
  };

  // Handle claiming tokens
  const handleClaimTokens = async () => {
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
    } catch (error: any) {
      console.error('❌ Failed to close raid:', error);

      // Check if transaction actually succeeded despite the error
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes('already been processed') || errorMsg.includes('Transaction simulation failed')) {
        // Transaction likely succeeded, check if the raid is closed on-chain
        console.log('⚠️ Transaction may have succeeded despite error');

        try {
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
          const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('raid'), Buffer.from(activeRaid.raidId)],
            RAID_PROGRAM_ID
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
  };

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

  return (
    <div>
      {/* Load Audius SDK from CDN */}
      <Script src="https://cdn.jsdelivr.net/npm/web3@latest/dist/web3.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/@audius/sdk@latest/dist/sdk.min.js" strategy="beforeInteractive" />

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">🎵 Audius Integration</h1>
          <div className="flex items-center gap-4">
            {sdkReady && (
              <div className="text-sm text-green-600 flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>SDK Ready</span>
              </div>
            )}

            {/* Audius OAuth Status */}
            {audiusConnected && audiusUser ? (
              <div className="flex items-center gap-3 p-2 bg-card border rounded-lg">
                {audiusUser.profilePicture && (
                  <img
                    src={audiusUser.profilePicture['150x150']}
                    alt={audiusUser.handle}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="text-sm">
                  <div className="font-medium text-foreground flex items-center gap-1">
                    @{audiusUser.handle}
                    {audiusUser.verified && <span className="text-blue-500">✓</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Audius Connected</div>
                </div>
                <button
                  onClick={handleAudiusLogout}
                  className="px-3 py-1 text-xs bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-md transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={handleAudiusLogin}
                disabled={!sdkReady}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
                </svg>
                Connect Audius
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Audius URL Input */}
          <div className="p-6 bg-card rounded-lg border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">Play by Audius Link</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="audius-url" className="block text-sm font-medium text-foreground mb-2">
                  Paste Audius track URL
                </label>
                <input
                  id="audius-url"
                  type="text"
                  value={audiusUrl}
                  onChange={(e) => setAudiusUrl(e.target.value)}
                  placeholder="https://audius.co/artist/track-name"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                {urlError && (
                  <p className="mt-2 text-sm text-destructive">{urlError}</p>
                )}
              </div>

              <button
                onClick={handleUrlSubmit}
                disabled={!audiusUrl.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-50 font-medium"
              >
                ➕ Add to Queue
              </button>

              <p className="text-xs text-muted-foreground">
                Copy track links from Audius. Example: https://audius.co/artist/track-name
              </p>
            </div>
          </div>

          {/* Current Track */}
          {currentTrack && (
            <div className="p-6 bg-card rounded-lg border">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Now Playing</h2>
              {playerError && (
                <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                  <div className="text-destructive text-sm">{playerError}</div>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-medium text-foreground">{currentTrack.name}</div>
                  <div className="text-sm text-muted-foreground">{currentTrack.artist}</div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer"
                       onClick={(e) => {
                         const rect = e.currentTarget.getBoundingClientRect();
                         const x = e.clientX - rect.left;
                         const percentage = x / rect.width;
                         seekTo(percentage * duration);
                       }}>
                    <div
                      className="absolute h-full bg-purple-500 transition-all"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={togglePlayback}
                    className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors"
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Song Queue */}
          <div className="p-6 bg-card rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">Track Queue</h2>
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
                <p>No tracks in queue</p>
                <p className="text-sm">Add tracks using Audius links above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {queuedTracks.map((track, index) => (
                  <div
                    key={`${track.id}-${track.addedAt}`}
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
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded disabled:opacity-50"
                        >
                          🎯 Raid
                        </button>
                      )}
                      <button
                        onClick={() => playFromQueue(track)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded"
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
          </div>

          {/* Features Info */}
          <div className="p-6 bg-muted/50 rounded-lg border">
            <h3 className="font-semibold mb-3 text-foreground">🎯 Audius Features</h3>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Decentralized music streaming</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Direct artist support</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Web3-native platform</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Raid coordination enabled</span>
              </div>
            </div>
          </div>
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
