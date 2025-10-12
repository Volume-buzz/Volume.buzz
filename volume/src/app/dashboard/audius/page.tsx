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

  // Raid creation state
  const [showRaidModal, setShowRaidModal] = useState(false);
  const [selectedTrackForRaid, setSelectedTrackForRaid] = useState<QueuedTrack | null>(null);

  // Raid participation state
  const [listeningTime, setListeningTime] = useState<number>(0);
  const [canClaim, setCanClaim] = useState<boolean>(false);
  const [claiming, setClaiming] = useState<boolean>(false);

  // Mark SDK as ready immediately (using direct API instead of SDK)
  useEffect(() => {
    setSdkReady(true);
    console.log('✅ Audius direct API ready');
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

  // Extract track ID from Audius URL or permalink
  const extractTrackId = (url: string): string | null => {
    try {
      // Match patterns like:
      // https://audius.co/artist/track-slug-123
      // /artist/track-slug-123
      const match = url.match(/audius\.co\/([^\/]+)\/([^\/\?]+)/);
      if (match) {
        // Return the full permalink path: "artist/track-slug"
        return `${match[1]}/${match[2]}`;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Fetch track metadata from Audius using official API
  const getTrackFromAudius = async (permalink: string): Promise<AudiusTrack | null> => {
    try {
      console.log('🔍 Fetching track from Audius API:', permalink);

      // Use official Audius API with your API key
      const apiHost = 'https://api.audius.co';
      const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY || '06ac216cd5916caeba332a0223469e28782a612eebc972a5c432efdc86aa78b9';

      const response = await fetch(`${apiHost}/v1/tracks/search?query=${encodeURIComponent(permalink)}&limit=1&app_name=VOLUME`, {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data?.data && data.data.length > 0) {
        const track = data.data[0];
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

    if (!audiusUrl.trim()) {
      setUrlError("Please enter an Audius URL");
      return;
    }

    if (!sdkReady) {
      setUrlError("Audius SDK is not ready yet. Please wait a moment and try again.");
      return;
    }

    const permalink = extractTrackId(audiusUrl);
    if (!permalink) {
      setUrlError("Invalid Audius URL. Please use a track link from Audius.");
      return;
    }

    // Check if track already exists in queue
    if (queuedTracks.some(track => track.id === permalink)) {
      setUrlError("This track is already in your queue");
      return;
    }

    try {
      // Fetch track metadata from Audius
      const trackInfo = await getTrackFromAudius(permalink);
      if (!trackInfo) {
        setUrlError("Could not fetch track information. Please check the URL.");
        return;
      }

      const newTrack: QueuedTrack = {
        id: trackInfo.id,
        uri: audiusUrl,
        name: trackInfo.title,
        artist: trackInfo.user.name,
        addedAt: Date.now(),
        permalink: trackInfo.permalink
      };

      setQueuedTracks(prev => [...prev, newTrack]);
      setAudiusUrl("");
      console.log("✅ Track added to queue:", newTrack.name);
    } catch (error) {
      console.error("Error adding track:", error);
      setUrlError("Failed to add track. Please try again.");
    }
  };

  // Play track from queue
  const playFromQueue = (track: QueuedTrack) => {
    setCurrentTrack(track);
    console.log("🎵 Now playing:", track.name);
  };

  // Remove track from queue
  const removeFromQueue = (trackId: string) => {
    setQueuedTracks(prev => prev.filter(track => track.id !== trackId));
  };

  // Clear entire queue
  const clearQueue = () => {
    setQueuedTracks([]);
  };

  // Track listening time for raid participation
  useEffect(() => {
    if (!activeRaid || !privyUser?.wallet?.address || !currentTrack) return;

    console.log('🔄 Starting listening timer for raid:', activeRaid.raidId);
    setListeningTime(0);
    setCanClaim(false);

    const interval = setInterval(() => {
      setListeningTime(prev => {
        const newTime = prev + 1;
        console.log('⏱️ Listening time:', newTime, 'seconds');

        // Enable claim button after 30 seconds
        if (newTime >= 30) {
          setCanClaim(true);
          console.log('🎉 30 seconds reached! You can claim your tokens now!');
        }

        return newTime;
      });
    }, 1000); // Update every second

    return () => {
      console.log('🛑 Stopping listening timer for raid:', activeRaid.raidId);
      clearInterval(interval);
    };
  }, [activeRaid?.raidId, privyUser?.wallet?.address, currentTrack]);

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

    setCurrentTrack(raidTrack);
    console.log('🎵 Now playing raid track:', activeRaid.trackName);
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
      {/* Note: Audius SDK loading disabled - using direct API instead */}

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
          {sdkReady && (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>SDK Ready</span>
            </div>
          )}
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
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-medium text-foreground">{currentTrack.name}</div>
                  <div className="text-sm text-muted-foreground">{currentTrack.artist}</div>
                </div>
                <div className="w-full" style={{ height: '120px' }}>
                  {/* Audius compact embed player */}
                  <iframe
                    src={`https://audius.co/embed/track/${currentTrack.id}?flavor=compact`}
                    width="100%"
                    height="120"
                    allow="encrypted-media"
                    style={{ border: 'none' }}
                    title={`Audius player - ${currentTrack.name}`}
                  />
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
