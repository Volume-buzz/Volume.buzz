'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';

interface PartyData {
  id: string;
  track: {
    title: string;
    artist: string;
    artwork: string;
  };
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  smart_contract: {
    raid_id?: string | null;
    escrow_pda: string | null;
  };
}

interface ParticipantStatus {
  qualified: boolean;
  claimed: boolean;
  listening_duration: number;
}

function ClaimPageContent() {
  const { partyId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

  const [status, setStatus] = useState<
    'loading' | 'not_qualified' | 'waiting_for_auth' | 'ready_to_claim' | 'claiming' | 'success' | 'error'
  >('loading');
  const [party, setParty] = useState<PartyData | null>(null);
  const [participant, setParticipant] = useState<ParticipantStatus | null>(null);
  const [message, setMessage] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const claimAttemptedRef = useRef(false);

  const discordId = searchParams.get('discordId');

  // Debug Privy state
  useEffect(() => {
    console.log('Privy state:', { ready, authenticated, user: user?.id, walletsCount: wallets.length });
  }, [ready, authenticated, user, wallets]);

  useEffect(() => {
    if (!discordId || !partyId) {
      setStatus('error');
      setMessage('Invalid claim request. Missing required parameters.');
      return;
    }

    fetchPartyAndParticipant();
  }, [partyId, discordId]);

  // Combined auth check and auto-claim logic
  useEffect(() => {
    console.log('Auth/Claim check:', { 
      status, 
      ready, 
      authenticated, 
      solanaWalletsCount: solanaWallets.length,
      participantQualified: participant?.qualified,
      claimAttempted: claimAttemptedRef.current
    });
    
    if (!ready || !participant?.qualified) {
      return;
    }

    // Check requirements
    if (!authenticated || solanaWallets.length === 0) {
      if (status !== 'waiting_for_auth') {
        setStatus('waiting_for_auth');
        setMessage(!authenticated ? 'Please sign in to claim rewards' : 'Please connect a wallet to claim rewards');
      }
      return;
    }

    // Ready to claim - update status if needed
    if (status !== 'ready_to_claim' && status !== 'claiming') {
      console.log('Auth complete, switching to ready_to_claim');
      setStatus('ready_to_claim');
      setMessage('You are eligible to claim your rewards!');
    }

    // Auto-trigger claim once ready
    if (status === 'ready_to_claim' && !claimAttemptedRef.current) {
      console.log('🎯 Auto-triggering claim transaction!');
      claimAttemptedRef.current = true;
      void handleClaim();
    }
  }, [ready, authenticated, solanaWallets, status, participant]);

  const fetchPartyAndParticipant = async () => {
    try {
      // Fetch party details
      const partyRes = await fetch(`${API_BASE}/api/listening-parties/${partyId}`);
      if (!partyRes.ok) {
        throw new Error('Party not found');
      }
      const partyData = await partyRes.json();
      setParty(partyData);

      // Find participant in party
      const participantData = partyData.participants.find(
        (p: any) => p.discord_id === discordId
      );

      if (!participantData) {
        setStatus('error');
        setMessage('You are not a participant in this listening party.');
        return;
      }

      const participantStatus: ParticipantStatus = {
        qualified: !!participantData.qualified_at,
        claimed: !!participantData.claimed_at,
        listening_duration: participantData.listening_duration || 0,
      };
      setParticipant(participantStatus);

      if (participantStatus.claimed) {
        setStatus('success');
        setMessage('You have already claimed your rewards for this party!');
        setTxSignature(participantData.claim_tx_signature || '');
      } else if (!participantStatus.qualified) {
        setStatus('not_qualified');
        setMessage(
          `You need to listen for at least 30 seconds. Current: ${participantStatus.listening_duration}s`
        );
      } else {
        // User is qualified - initial status, will be updated by auth check effect
        setStatus('ready_to_claim');
        setMessage('Checking wallet status...');
      }
    } catch (error: any) {
      console.error('Error fetching party:', error);
      setStatus('error');
      setMessage(error.message || 'Failed to load party details');
    }
  };

  const handleClaim = async () => {
    try {
      // Auto-login if not authenticated
      if (!authenticated) {
        console.log('User not authenticated, triggering login');
        login();
        return;
      }

      // Auto-connect wallet if needed
      if (solanaWallets.length === 0) {
        console.log('No Solana wallets found');
        setStatus('error');
        setMessage('Please connect a Solana wallet first.');
        return;
      }

      setStatus('claiming');
      setMessage('Preparing claim transaction...');

      // Dynamic imports
      const { Program, AnchorProvider } = await import('@coral-xyz/anchor');
      const { RAID_PROGRAM_ID, SOLANA_RPC_URL } = await import('@/lib/raid-program');
      const idl = await import('@/lib/idl/raid_escrow.json');

      // Get wallet adapter (same as dashboard)
      const getWalletAdapter = () => {
        if (solanaWallets.length > 0) {
          const solanaWallet = solanaWallets[0];
      return {
        publicKey: new PublicKey(solanaWallet.address),
        signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
          const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
          const result = await signTransaction({
            transaction: serializedTransaction,
            wallet: solanaWallet
          });
          return Transaction.from(result.signedTransaction) as T;
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
          const results = [];
          for (const tx of transactions) {
            const signed = await signTransaction({
              transaction: tx.serialize({ requireAllSignatures: false }),
              wallet: solanaWallet
            });
            results.push(Transaction.from(signed.signedTransaction) as T);
          }
          return results;
        }
      };
        }
        return null;
      };

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

      // Use the raid_id from smart_contract if available, otherwise try to shorten the party ID
      // The raid_id is designed to be <32 bytes for PDA derivation
      const fullPartyId = partyId as string;
      let raidId: string;

      if (party!.smart_contract.raid_id) {
        // Use the stored raid_id (this is the correct approach)
        raidId = party!.smart_contract.raid_id;
        console.log('✅ Using stored raid_id:', raidId, 'length:', raidId.length);
      } else {
        // Fallback: extract from party ID (for old parties without raid_id)
        console.log('⚠️ No raid_id found, extracting from party ID:', fullPartyId);
        const parts = fullPartyId.split('_');
        if (parts.length >= 3) {
          // Format: {trackId}_{discordId}_{timestamp} -> use {trackId}_{shortTimestamp}
          const trackId = parts[0];
          const timestamp = parts[2].slice(-8); // Last 8 digits
          raidId = `${trackId}_${timestamp}`;
          console.log('🔄 Extracted raid ID:', raidId, 'length:', raidId.length);
        } else {
          // Last resort: truncate
          raidId = fullPartyId.substring(0, 31);
          console.warn('⚠️ Had to truncate party ID to:', raidId);
        }
      }

      setMessage('Deriving program addresses...');

      // Derive PDAs using the raid ID
      const [raidEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('raid'), Buffer.from(raidId)],
        RAID_PROGRAM_ID
      );

      const tokenMintPubkey = new PublicKey(party!.reward.token_mint);
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

      setMessage('Checking token account...');

      // Check if participant token account exists, create if not
      const participantAccountInfo = await connection.getAccountInfo(participantTokenAccount);
      if (!participantAccountInfo) {
        console.log('📦 Creating participant token account...');
        setMessage('Creating token account...');

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

      setMessage('Claiming tokens...');
      console.log('📡 Calling claim_tokens on devnet program...');

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

      setMessage('Recording claim...');

      // Record claim on backend
      await fetch(`${API_BASE}/api/listening-parties/${partyId}/claim-confirmed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          discord_id: discordId,
          tx_signature: tx,
        }),
      });

      setTxSignature(tx);
      setStatus('success');
      setMessage('Rewards claimed successfully!');
    } catch (error: any) {
      console.error('Error claiming:', error);
      setStatus('error');
      setMessage(error.message || 'Failed to claim rewards. Please try again.');
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#121212] text-white">
      {/* Grid background like wallet-connect */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(231,229,228,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(231,229,228,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 0',
          maskImage:
            'repeating-linear-gradient(to right, black 0px, black 3px, transparent 3px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 3px, transparent 3px, transparent 8px)',
          WebkitMaskImage:
            'repeating-linear-gradient(to right, black 0px, black 3px, transparent 3px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 3px, transparent 3px, transparent 8px)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-white/5 bg-[#1b1b1b] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-block rounded-full bg-white/5 p-4">
              <svg
                className="w-12 h-12 text-white/70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold text-white mb-2">Claim Your Rewards</h1>
            <p className="text-sm text-white/60">Complete your listening party claim</p>
          </div>

          {/* Party Info */}
          {party && (
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4 bg-white/5 p-4 rounded-lg">
                {party.track.artwork && (
                  <img
                    src={party.track.artwork}
                    alt={party.track.title}
                    className="w-16 h-16 rounded-lg shadow-lg"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white">{party.track.title}</h2>
                  <p className="text-white/60 text-sm">{party.track.artist}</p>
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-white/70 text-sm">
                  Reward: <span className="text-white font-bold">{party.reward.tokens_per_participant} tokens</span>
                </p>
              </div>
            </div>
          )}

        {/* Status Display */}
        <div className="space-y-6">
          {status === 'loading' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white/60"></div>
              <p className="text-white/60 mt-4">Loading...</p>
            </div>
          )}

          {status === 'not_qualified' && (
            <div className="text-center py-8">
              <div className="inline-block p-4 bg-yellow-500/20 rounded-full mb-4">
                <svg
                  className="w-12 h-12 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Not Qualified Yet</h3>
              <p className="text-white/70">{message}</p>
            </div>
          )}

          {status === 'waiting_for_auth' && (
            <>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 text-sm text-white/70">
                {message}
              </div>
              <button
                onClick={() => {
                  console.log('Connect button clicked', { authenticated, solanaWalletsCount: solanaWallets.length });
                  login(); // Privy should handle wallet creation/connection
                }}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200"
              >
                {!authenticated ? 'Sign In to Claim' : 'Connect Wallet to Claim'}
              </button>
            </>
          )}

          {status === 'ready_to_claim' && (
            <>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 text-sm text-white/70">
                {message}
              </div>
              <button
                onClick={handleClaim}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200"
              >
                Claim Rewards
              </button>
            </>
          )}

          {status === 'claiming' && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white/60"></div>
              <p className="text-white/60 mt-4">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
                <svg
                  className="w-12 h-12 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Success!</h3>
              <p className="text-white/70 mb-4">{message}</p>
              {txSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-white/60 hover:text-white underline text-sm"
                >
                  View Transaction
                </a>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <div className="inline-block p-4 bg-red-500/20 rounded-full mb-4">
                <svg
                  className="w-12 h-12 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Claim Failed</h3>
              <p className="text-white/70 mb-4">{message}</p>
              <button
                onClick={() => router.back()}
                className="text-white/60 hover:text-white underline"
              >
                Go Back
              </button>
            </div>
          )}
        </div>

          {participant && (
            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Listening Duration</span>
                <span className="text-white font-bold">{participant.listening_duration}s / 30s</span>
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-white/40">
            Powered by Privy
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    }>
      <ClaimPageContent />
    </Suspense>
  );
}
