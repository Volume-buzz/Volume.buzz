'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { useRaid } from '@/contexts/RaidContext';
import { QueuedTrack } from '@/types/raid';
import { RAID_PROGRAM_ID, SOLANA_RPC_URL } from '@/lib/raid-program';
import idl from '@/lib/idl/raid_escrow.json';
import type { RaidEscrow } from '@/lib/types/raid_escrow';

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

  const handleCreateRaid = async () => {
    if (!selectedToken) {
      setError('Please select a token');
      return;
    }

    if (tokensPerUser <= 0 || maxSeats <= 0) {
      setError('Invalid values');
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

    // Generate unique raid ID
    // Format: {trackId}_{timestamp}
    const timestamp = Date.now().toString().slice(-6);
    const raidId = `${track.id}_${timestamp}`;

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
      onClose();

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

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="space-y-4">
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

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-md text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateRaid}
            disabled={!selectedToken || loadingTokens || creating}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating Raid...' : 'Create Raid'}
          </button>
        </div>
      </div>
    </div>
  );
}
