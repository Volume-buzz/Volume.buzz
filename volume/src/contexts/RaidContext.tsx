'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo } from 'react';
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Use ref instead of state to avoid triggering re-renders and re-fetches
  const manuallyClearedRef = useRef<Set<string>>(new Set());

  // Ref to store previous raid for deep comparison
  const prevRaidRef = useRef<ActiveRaid | null>(null);

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
            manuallyCleared: manuallyClearedRef.current.has(raidData.raidId)
          });

          // Skip raids that were manually cleared by user
          if (manuallyClearedRef.current.has(raidData.raidId)) {
            console.log('⏭️ Skipping manually cleared raid:', raidData.raidId);
            continue;
          }

          // Auto-clear expired raids so they don't keep showing up
          if (currentTime >= expiryTime) {
            console.log('⏰ Auto-clearing expired raid:', raidData.raidId);
            manuallyClearedRef.current.add(raidData.raidId);
            localStorage.setItem('cleared_raids', JSON.stringify([...manuallyClearedRef.current]));
            continue;
          }

          if (currentTime < expiryTime) {
            console.log('✅ Found active (non-expired) raid:', raidData.raidId);

            // Parse track ID from raid_id
            // Format: {trackId}_{timestamp}{random} or {trackId}_{timestamp}
            // Extract track ID by removing timestamp+random suffix
            const raidIdStr = raidData.raidId;

            // Find the last underscore - everything before it is the track ID
            const lastUnderscoreIndex = raidIdStr.lastIndexOf('_');
            const trackId = lastUnderscoreIndex >= 0
              ? raidIdStr.substring(0, lastUnderscoreIndex)
              : raidIdStr;

            // Construct URI - default to Spotify format
            // Note: Audius track IDs are typically alphanumeric (e.g., Q47QxBW)
            // while Spotify track IDs are exactly 22 chars alphanumeric
            let trackUri = '';
            if (trackId) {
              // Simple heuristic: if trackId looks like a Spotify ID (22 chars), use spotify: URI
              // Otherwise use Audius URL format
              if (trackId.length === 22 && /^[a-zA-Z0-9]+$/.test(trackId)) {
                trackUri = `spotify:track:${trackId}`;
              } else {
                // Assume Audius
                trackUri = `https://audius.co/track/${trackId}`;
              }
            }

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

      // Only update if raid actually changed (deep equality check on ALL properties)
      if (mostRecentRaid) {
        const hasChanged = !activeRaid ||
          activeRaid.raidId !== mostRecentRaid.raidId ||
          activeRaid.claimedCount !== mostRecentRaid.claimedCount ||
          activeRaid.maxSeats !== mostRecentRaid.maxSeats ||
          activeRaid.tokensPerParticipant !== mostRecentRaid.tokensPerParticipant ||
          activeRaid.trackName !== mostRecentRaid.trackName ||
          activeRaid.trackArtist !== mostRecentRaid.trackArtist ||
          activeRaid.tokenSymbol !== mostRecentRaid.tokenSymbol ||
          activeRaid.tokenName !== mostRecentRaid.tokenName ||
          activeRaid.tokenMint !== mostRecentRaid.tokenMint ||
          activeRaid.trackUri !== mostRecentRaid.trackUri ||
          activeRaid.trackId !== mostRecentRaid.trackId ||
          activeRaid.creatorWallet !== mostRecentRaid.creatorWallet ||
          activeRaid.createdAt !== mostRecentRaid.createdAt ||
          activeRaid.expiresAt !== mostRecentRaid.expiresAt ||
          JSON.stringify(activeRaid.claimedBy.slice().sort()) !== JSON.stringify(mostRecentRaid.claimedBy.slice().sort());

        if (hasChanged) {
          console.log('🎯 Raid data changed, updating:', {
            raidId: mostRecentRaid.raidId,
            claimedCount: mostRecentRaid.claimedCount,
            changes: {
              raidId: activeRaid?.raidId !== mostRecentRaid.raidId,
              claimedCount: activeRaid?.claimedCount !== mostRecentRaid.claimedCount,
              trackName: activeRaid?.trackName !== mostRecentRaid.trackName,
              trackArtist: activeRaid?.trackArtist !== mostRecentRaid.trackArtist,
            }
          });
          prevRaidRef.current = mostRecentRaid;
          setActiveRaid(mostRecentRaid);
          setLastRaidId(mostRecentRaid.raidId);
        } else {
          // Raid data unchanged - don't call setActiveRaid to prevent re-render
          console.log('✅ Same raid data, no update needed');
        }
      } else if (!mostRecentRaid && activeRaid) {
        console.log('❌ No active raids found, clearing');
        prevRaidRef.current = null;
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
        manuallyClearedRef.current = new Set(clearedRaidsArray);
        console.log('📋 Loaded cleared raids list:', clearedRaidsArray);
      } catch (error) {
        console.error('Failed to load cleared raids:', error);
      }
    }

    const savedRaid = localStorage.getItem('active_raid');
    if (savedRaid) {
      try {
        const parsedRaid = JSON.parse(savedRaid);
        // Only restore if not expired
        if (parsedRaid.expiresAt && parsedRaid.expiresAt > Date.now()) {
          setActiveRaid(parsedRaid);
          console.log('✅ Restored non-expired raid from localStorage');
        } else {
          console.log('⏰ Saved raid is expired, not restoring');
          localStorage.removeItem('active_raid');
        }
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
  }, [isInitialized]); // Removed manuallyCleared to prevent re-fetch loop

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
      manuallyClearedRef.current.add(activeRaid.raidId);
      localStorage.setItem('cleared_raids', JSON.stringify([...manuallyClearedRef.current]));
    }
    setActiveRaid(null);
  };

  const hasClaimed = (walletAddress: string): boolean => {
    if (!activeRaid) return false;
    return activeRaid.claimedBy.includes(walletAddress);
  };

  // Memoize context value to prevent re-renders when object reference changes
  // Only create new object when activeRaid actually changes
  const contextValue = useMemo(
    () => ({ activeRaid, createRaid, endRaid, hasClaimed, refreshRaids: fetchActiveRaids }),
    [activeRaid]
  );

  return (
    <RaidContext.Provider value={contextValue}>
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
