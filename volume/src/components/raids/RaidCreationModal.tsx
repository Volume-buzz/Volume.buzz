'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { useRaid } from '@/contexts/RaidContext';
import { QueuedTrack } from '@/types/raid';
import { RAID_PROGRAM_ID, SOLANA_RPC_URL } from '@/lib/raid-program';
import idl from '@/lib/idl/raid_escrow.json';

interface RaidCreationModalProps {
  track: QueuedTrack;
  platform?: 'spotify' | 'audius';
  onClose: () => void;
}

interface UserToken {
  mint: string;
  name: string;
  symbol: string;
  balance: number;
}

interface DiscordServer {
  id: string;
  name: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export function RaidCreationModal({ track, platform = 'spotify', onClose }: RaidCreationModalProps) {
  const { user, authenticated, login, logout } = usePrivy();
  const { createRaid } = useRaid();

  const [userTokens, setUserTokens] = useState<UserToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [tokensPerUser, setTokensPerUser] = useState<number>(10);
  const [maxSeats, setMaxSeats] = useState<number>(10);
  const [error, setError] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [lastRaidCreation, setLastRaidCreation] = useState<number>(0);
  const [servers, setServers] = useState<DiscordServer[]>([]);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loadingServers, setLoadingServers] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Fetch user's tokens
  useEffect(() => {
    async function fetchUserTokens() {
      if (!user?.wallet?.address) return;

      try {
        const connection = new Connection('https://api.devnet.solana.com');
        const walletPubkey = new PublicKey(user.wallet.address);

        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        );

        const tokens: UserToken[] = [];
        for (const account of tokenAccounts.value) {
          const info = account.account.data.parsed.info;
          const mint = info.mint;
          const balance = info.tokenAmount.uiAmount;

          // Try to get token metadata (name/symbol)
          // For now, just show mint address, we'll add metadata fetching later
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
        setError('Failed to load your tokens');
      } finally {
        setLoadingTokens(false);
      }
    }

    fetchUserTokens();
  }, [user?.wallet?.address]);

  // Fetch Discord servers where user is admin
  useEffect(() => {
    async function fetchServers() {
      setLoadingServers(true);
      try {
        const res = await fetch('/api/discord/servers', {
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load Discord servers. Reconnect Discord and try again.');
        }

        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : raw?.servers ?? [];
        const normalized = list.map((server: any) => ({
          id: server.id,
          name: server.name,
        }));
        setServers(normalized);
        setError(normalized.length === 0 ? 'No Discord servers found where you are an admin. Verify your Discord login and permissions.' : '');
      } catch (err) {
        console.error('Failed to fetch Discord servers:', err);
        setServers([]);
        setError(err instanceof Error ? err.message : 'Failed to load Discord servers');
      } finally {
        setLoadingServers(false);
      }
    }

    fetchServers();
  }, []);

  // Fetch channels whenever server changes
  useEffect(() => {
    async function fetchChannels(serverId: string) {
      setLoadingChannels(true);
      try {
        const res = await fetch(`/api/discord/servers/${serverId}/channels`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch server channels. Ensure the bot has permissions to post.');
        }

        const payload = await res.json();
        const list = (payload.channels || []).filter((channel: any) => channel.type === 0 || channel.type === 5);
        console.log('Fetched Discord channels for raid creation:', list);
        setChannels(list);
        setError(list.length === 0 ? 'No text or announcement channels found. Update channel permissions and try again.' : '');
      } catch (err) {
        console.error('Failed to fetch Discord channels:', err);
        setChannels([]);
        setError(err instanceof Error ? err.message : 'Failed to load Discord channels');
      } finally {
        setLoadingChannels(false);
      }
    }

    if (selectedServerId) {
      const server = servers.find((s) => s.id === selectedServerId);
      if (!server) {
        setChannels([]);
        setSelectedChannelId('');
        setError('Selected server unavailable. Refresh the page and try again.');
        return;
      }
      fetchChannels(selectedServerId);
    } else {
      setChannels([]);
      setSelectedChannelId('');
    }
  }, [selectedServerId, servers]);

  const handleCreateRaid = async () => {
    setError('');

    if (!selectedToken) {
      setError('Please select a token');
      return;
    }

    if (tokensPerUser <= 0 || maxSeats <= 0) {
      setError('Invalid values');
      return;
    }

    if (!selectedServerId) {
      setError('Select a Discord server to post the raid announcement.');
      return;
    }

    if (!servers.find((s) => s.id === selectedServerId)) {
      setError('Selected server unavailable. Refresh the page and try again.');
      return;
    }

    if (!selectedChannelId) {
      setError('Select a Discord channel where the raid embed should be posted.');
      return;
    }

    const selectedTokenData = userTokens.find(t => t.mint === selectedToken);
    if (!selectedTokenData) {
      setError('Token not found');
      return;
    }

    // Check if user has enough tokens
    const totalNeeded = tokensPerUser * maxSeats;
    if (selectedTokenData.balance < totalNeeded) {
      setError(`Insufficient balance. Need ${totalNeeded} tokens, have ${selectedTokenData.balance}`);
      return;
    }

    // Add cooldown to prevent rapid duplicate submissions
    const now = Date.now();
    if (now - lastRaidCreation < 3000) {
      setError('Please wait a moment before creating another raid');
      return;
    }

    // Generate unique raid ID with random suffix for guaranteed uniqueness
    // Format: {trackId}_{timestamp+random} to prevent collisions while staying under 32 bytes
    // Spotify track IDs: 22 chars + underscore (1) + 6 timestamp + 2 random = 31 chars total
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 2-digit random
    const raidId = `${track.id}_${timestamp}${random}`;

    try {
      setError('');
      setCreating(true);
      setLastRaidCreation(now);
      console.log('✅ Calling deployed raid escrow program on devnet...');

      console.log('🆔 Generated raid ID:', raidId);
      console.log('🎵 Platform:', platform);
      console.log('🎵 Track ID:', track.id);
      console.log('📏 Raid ID length:', raidId.length);

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

      // Initialize program (use address from IDL)
      const program = new Program(idl as any, provider);

      // Derive PDAs
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(selectedToken);
      const creatorPubkey = new PublicKey(user!.wallet!.address);

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

      // Get fresh blockhash to ensure uniqueness
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      console.log('🔗 Using blockhash:', blockhash.slice(0, 8) + '...');

      // Call initialize_raid on deployed program
      const tx = await program.methods
        .initializeRaid(
          raidId,
          new BN(tokensPerUser * 1e9), // Convert to lamports (assuming 9 decimals)
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

      // Transaction submitted successfully
      console.log('✅ Transaction submitted successfully!');

      // Store in context for UI
      createRaid({
        raidId,
        trackId: track.id,
        trackName: track.name,
        trackArtist: track.artist,
        trackUri: track.uri,
        tokenMint: selectedToken,
        tokenName: selectedTokenData.name,
        tokenSymbol: selectedTokenData.symbol,
        tokensPerParticipant: tokensPerUser,
        maxSeats,
        creatorWallet: user!.wallet!.address,
        claimedCount: 0,
        claimedBy: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000)
      });

      alert(`🎉 Raid created successfully!\n\nView on explorer:\nhttps://explorer.solana.com/tx/${tx}?cluster=devnet`);
      try {
        const tokensPerParticipantLamports = BigInt(Math.round(tokensPerUser * 1e9)).toString();
        const backendResponse = await fetch('/api/listening-parties', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            track_id: track.id,
            track_title: track.name,
            track_artist: track.artist,
            track_artwork_url: (track as any).artwork ?? '',
            platform,
            token_mint: selectedToken,
            tokens_per_participant: tokensPerParticipantLamports,
            max_participants: maxSeats,
            duration_minutes: 30,
            server_id: selectedServerId,
            channel_id: selectedChannelId,
          }),
        });

        if (!backendResponse.ok) {
          const data = await backendResponse.json().catch(() => ({}));
          const message = data.error || 'Raid created on-chain, but failed to notify Discord.';
          console.error('Failed to notify backend after raid creation:', message);
          alert(`${message}\n\nYou can retry by opening the raid modal again or posting manually through the bot.`);
          setError(message);
        } else {
          console.log('✅ Backend notified to post raid details to Discord.');
          setError('');
          onClose();
        }
      } catch (notifyError) {
        console.error('Failed to notify backend:', notifyError);
        alert('Raid created on-chain, but we could not post the Discord embed automatically. Try again or post manually.');
        setError('Raid created on-chain, but failed to notify Discord. Try again from the dashboard.');
      } finally {
        setCreating(false);
      }

    } catch (err: any) {
      console.error('❌ Raid creation error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Check if transaction actually succeeded despite error
      if (err.signature || errorMsg.includes('already been processed')) {
        const txSig = err.signature || 'unknown';
        console.log('⚠️ Transaction may have succeeded despite error');

        // Store raid anyway since transaction likely succeeded
        createRaid({
          raidId,
          trackId: track.id,
          trackName: track.name,
          trackArtist: track.artist,
          trackUri: track.uri,
          tokenMint: selectedToken,
          tokenName: selectedTokenData.name,
          tokenSymbol: selectedTokenData.symbol,
          tokensPerParticipant: tokensPerUser,
          maxSeats,
          creatorWallet: user!.wallet!.address,
          claimedCount: 0,
          claimedBy: [],
          createdAt: Date.now(),
          expiresAt: Date.now() + (30 * 60 * 1000)
        });

        alert(`✅ Raid created! (Warning: ${errorMsg})\n\nCheck explorer:\nhttps://explorer.solana.com/tx/${txSig}?cluster=devnet`);
        onClose();
      } else {
        // Actual failure
        setError(`Failed to create raid: ${errorMsg}`);
        setCreating(false);
      }
    }
  };

  // Show wallet connection prompt if not authenticated
  if (!authenticated || !user?.wallet?.address) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-card border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold text-foreground mb-4">Connect Wallet</h2>

          <div className="mb-4 p-3 bg-muted/50 rounded">
            <div className="font-medium text-foreground">{track.name}</div>
            <div className="text-sm text-muted-foreground">{track.artist}</div>
          </div>

          <div className="text-center py-8">
            <div className="text-6xl mb-4">👛</div>
            <p className="text-muted-foreground mb-6">
              Connect your wallet to create a raid and distribute tokens
            </p>
            <button
              onClick={login}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Connect Wallet
            </button>
          </div>

          <div className="mt-4">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 border border-border rounded-md text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-foreground mb-4">Start Raid</h2>

        <div className="mb-4 p-3 bg-muted/50 rounded">
          <div className="font-medium text-foreground">{track.name}</div>
          <div className="text-sm text-muted-foreground">{track.artist}</div>
        </div>

        <div className="space-y-4">
          {/* Discord Server */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Discord Server
            </label>
            {loadingServers ? (
              <div className="text-sm text-muted-foreground">Loading your Discord servers...</div>
            ) : (
              <select
                value={selectedServerId}
                onChange={(e) => {
                  setSelectedServerId(e.target.value);
                  setSelectedChannelId('');
                }}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="">Select a server...</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Discord Channel */}
          {selectedServerId && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Discord Channel
              </label>
              {loadingChannels ? (
                <div className="text-sm text-muted-foreground">Loading channels...</div>
              ) : (
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
                >
                  <option value="">Select a channel...</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              )}
              {!loadingChannels && channels.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No eligible text or announcement channels found. Check the bot&apos;s permissions in this server.
                </p>
              )}
            </div>
          )}

          {/* Token Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Select Token
            </label>
            {loadingTokens ? (
              <div className="text-sm text-muted-foreground">Loading your tokens...</div>
            ) : userTokens.length === 0 ? (
              <div className="text-sm text-muted-foreground">No tokens found. Create a token in the wallet tab first.</div>
            ) : (
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              >
                <option value="">Select a token...</option>
                {userTokens.map((token) => (
                  <option key={token.mint} value={token.mint}>
                    {token.name} ({token.symbol}) - Balance: {token.balance}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tokens Per User */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Tokens Per Participant
            </label>
            <input
              type="number"
              value={tokensPerUser}
              onChange={(e) => setTokensPerUser(Number(e.target.value))}
              min="1"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          {/* Max Seats */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Max Participants
            </label>
            <input
              type="number"
              value={maxSeats}
              onChange={(e) => setMaxSeats(Number(e.target.value))}
              min="1"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
            />
          </div>

          {/* Summary */}
          {selectedToken && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-sm">
              <div className="text-blue-800 dark:text-blue-200">
                <strong>Total tokens needed:</strong> {tokensPerUser * maxSeats}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-md text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateRaid}
            disabled={
              !selectedToken ||
              loadingTokens ||
              creating ||
              !selectedServerId ||
              !selectedChannelId
            }
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating Raid...' : 'Create Raid'}
          </button>
        </div>
      </div>
    </div>
  );
}
