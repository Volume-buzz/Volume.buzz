'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { RAID_PROGRAM_ID, SOLANA_RPC_URL } from '@/lib/raid-program';
import idl from '@/lib/idl/raid_escrow.json';
import type { RaidEscrow } from '@/lib/types/raid_escrow';

export interface PreSignedClaim {
  participantIndex: number; // Index 0 to maxSeats-1
  serializedTransaction: string; // Base64 encoded signed transaction
  claimed: boolean;
}

export interface ActiveRaid {
  raidId: string; // Unique ID used for PDA derivation
  trackId: string;
  trackName: string;
  trackArtist: string;
  trackUri: string;
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  tokensPerParticipant: number;
  maxSeats: number;
  creatorWallet: string;
  claimedCount: number; // Number of people who have claimed (from on-chain)
  claimedBy: string[]; // Wallet addresses that have claimed (from on-chain)
  createdAt: number;
  expiresAt: number; // Unix timestamp when raid expires
}

interface RaidContextType {
  activeRaid: ActiveRaid | null;
  createRaid: (raid: ActiveRaid) => void;
  endRaid: () => void;
  hasClaimed: (walletAddress: string) => boolean;
  refreshRaids: () => Promise<void>;
}

const RaidContext = createContext<RaidContextType | undefined>(undefined);

export function RaidProvider({ children }: { children: ReactNode }) {
  const [activeRaid, setActiveRaid] = useState<ActiveRaid | null>(null);
  const [lastRaidId, setLastRaidId] = useState<string>('');
  const [manuallyCleared, setManuallyCleared] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch active raids from blockchain
  const fetchActiveRaids = async () => {
    try {
      console.log('🔍 Fetching active raids from blockchain...');
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

      // Get all program accounts (raid PDAs) - no filters to see everything
      const accounts = await connection.getProgramAccounts(RAID_PROGRAM_ID);

      console.log(`📦 Found ${accounts.length} raid accounts on-chain`);

      // Find the most recent non-expired raid
      let mostRecentRaid: ActiveRaid | null = null;
      let mostRecentTime = 0;

      for (const account of accounts) {
        try {
          // Decode account data using the program
          const provider = new AnchorProvider(
            connection,
            {} as any, // No wallet needed for reading
            { commitment: 'confirmed' }
          );
          const program = new Program<RaidEscrow>(idl as RaidEscrow, provider);

          // Try to fetch - if account was closed, this will fail
          const raidData = await program.account.raidEscrow.fetch(account.pubkey);

          // Check if raid is not expired (30 minutes = 1800 seconds)
          const currentTime = Math.floor(Date.now() / 1000);
          const expiryTime = raidData.expiresAt.toNumber();

          console.log('Checking raid:', {
            raidId: raidData.raidId,
            expiryTime,
            currentTime,
            timeLeft: expiryTime - currentTime,
            expired: currentTime >= expiryTime,
            manuallyCleared: manuallyCleared.has(raidData.raidId)
          });

          // Skip raids that were manually cleared by user
          if (manuallyCleared.has(raidData.raidId)) {
            console.log('⏭️ Skipping manually cleared raid:', raidData.raidId);
            continue;
          }

          if (currentTime < expiryTime) {
            console.log('✅ Found active (non-expired) raid:', raidData.raidId);

            // Parse track ID from raid_id (format: {spotifyTrackId}_{timestamp})
            const trackId = raidData.raidId.includes('_')
              ? raidData.raidId.split('_')[0]
              : '';
            const trackUri = trackId ? `spotify:track:${trackId}` : '';

            console.log('🎵 Parsed track ID from raid_id:', trackId);
            console.log('🔗 Constructed track URI:', trackUri);

            // Create raid info from on-chain data (always use on-chain as source of truth)
            const onChainRaid: ActiveRaid = {
              raidId: raidData.raidId,
              trackId: trackId,
              trackName: 'Active Raid',
              trackArtist: `${raidData.maxSeats - raidData.claimedCount} seats remaining`,
              trackUri: trackUri,
              tokenMint: raidData.tokenMint.toString(),
              tokenName: 'Token',
              tokenSymbol: 'TOK',
              tokensPerParticipant: raidData.tokensPerParticipant.toNumber() / 1e9,
              maxSeats: raidData.maxSeats,
              creatorWallet: raidData.creator.toString(),
              claimedCount: raidData.claimedCount,
              claimedBy: raidData.claimedBy.map((pk: any) => pk.toString()),
              createdAt: (expiryTime - 1800) * 1000, // Estimate from expiry - 30 mins
              expiresAt: expiryTime * 1000 // Convert to milliseconds
            };

            // Try to get local metadata for better display
            const localRaidData = localStorage.getItem(`raid_${raidData.raidId}`);
            if (localRaidData) {
              try {
                const parsedRaid = JSON.parse(localRaidData);
                // Merge: use on-chain data for critical fields, local data for display
                onChainRaid.trackName = parsedRaid.trackName || onChainRaid.trackName;
                onChainRaid.trackArtist = parsedRaid.trackArtist || onChainRaid.trackArtist;
                onChainRaid.trackUri = parsedRaid.trackUri || onChainRaid.trackUri;
                onChainRaid.trackId = parsedRaid.trackId || onChainRaid.trackId;
                onChainRaid.tokenName = parsedRaid.tokenName || onChainRaid.tokenName;
                onChainRaid.tokenSymbol = parsedRaid.tokenSymbol || onChainRaid.tokenSymbol;
              } catch (e) {
                console.error('Error parsing local raid data:', e);
              }
            }

            if (onChainRaid.createdAt > mostRecentTime) {
              mostRecentTime = onChainRaid.createdAt;
              mostRecentRaid = onChainRaid;
            }
          }
        } catch (err: any) {
          // Silently skip - likely a closed raid account
          if (err?.message?.includes('Account does not exist')) {
            // Raid was closed, skip it
          } else {
            console.error('Error decoding raid account:', err);
          }
        }
      }

      // Only update if raid actually changed (check all relevant fields)
      if (mostRecentRaid) {
        const hasChanged = !activeRaid ||
          activeRaid.raidId !== mostRecentRaid.raidId ||
          activeRaid.claimedCount !== mostRecentRaid.claimedCount ||
          activeRaid.trackName !== mostRecentRaid.trackName ||
          activeRaid.trackArtist !== mostRecentRaid.trackArtist ||
          JSON.stringify(activeRaid.claimedBy) !== JSON.stringify(mostRecentRaid.claimedBy);

        if (hasChanged) {
          console.log('🎯 Setting active raid:', mostRecentRaid.raidId);
          setActiveRaid(mostRecentRaid);
          setLastRaidId(mostRecentRaid.raidId);
        } else {
          console.log('✅ Same raid data, skipping update to prevent re-render');
        }
      } else if (!mostRecentRaid && activeRaid) {
        console.log('❌ No active raids found, clearing');
        setActiveRaid(null);
        setLastRaidId('');
      }
    } catch (error) {
      console.error('Failed to fetch active raids:', error);
    }
  };

  // Load cleared raids on mount (one time only)
  useEffect(() => {
    const clearedRaidsStr = localStorage.getItem('cleared_raids');
    if (clearedRaidsStr) {
      try {
        const clearedRaidsArray = JSON.parse(clearedRaidsStr);
        setManuallyCleared(new Set(clearedRaidsArray));
        console.log('📋 Loaded cleared raids list:', clearedRaidsArray);
      } catch (error) {
        console.error('Failed to load cleared raids:', error);
      }
    }

    const savedRaid = localStorage.getItem('active_raid');
    if (savedRaid) {
      try {
        setActiveRaid(JSON.parse(savedRaid));
      } catch (error) {
        console.error('Failed to load raid from localStorage:', error);
      }
    }

    setIsInitialized(true);
  }, []);

  // Fetch raids from blockchain after initialization
  useEffect(() => {
    if (!isInitialized) return;

    // Initial fetch
    fetchActiveRaids();

    // Poll for active raids every 10 seconds
    const interval = setInterval(fetchActiveRaids, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, manuallyCleared]);

  // Save raid to localStorage whenever it changes
  useEffect(() => {
    if (activeRaid) {
      localStorage.setItem('active_raid', JSON.stringify(activeRaid));
      // Also store with raid ID for cross-browser lookup
      localStorage.setItem(`raid_${activeRaid.raidId}`, JSON.stringify(activeRaid));
    } else {
      localStorage.removeItem('active_raid');
    }
  }, [activeRaid]);

  const createRaid = (raid: ActiveRaid) => {
    setActiveRaid(raid);
  };

  const endRaid = () => {
    // Mark current raid as manually cleared so it doesn't reappear
    if (activeRaid) {
      console.log('🚫 Marking raid as manually cleared:', activeRaid.raidId);
      setManuallyCleared(prev => new Set([...prev, activeRaid.raidId]));
      localStorage.setItem('cleared_raids', JSON.stringify([...manuallyCleared, activeRaid.raidId]));
    }
    setActiveRaid(null);
  };

  const hasClaimed = (walletAddress: string): boolean => {
    if (!activeRaid) return false;
    return activeRaid.claimedBy.includes(walletAddress);
  };

  return (
    <RaidContext.Provider value={{ activeRaid, createRaid, endRaid, hasClaimed, refreshRaids: fetchActiveRaids }}>
      {children}
    </RaidContext.Provider>
  );
}

export function useRaid() {
  const context = useContext(RaidContext);
  if (context === undefined) {
    throw new Error('useRaid must be used within a RaidProvider');
  }
  return context;
}
