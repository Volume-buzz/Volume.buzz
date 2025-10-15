'use client';

import { useRaid } from '@/contexts/RaidContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect, useMemo, memo } from 'react';

interface RaidBannerProps {
  onJoinRaid: () => void;
  listeningTime?: number;
  canClaim?: boolean;
  onClaimTokens?: () => void;
  claiming?: boolean;
  onEndRaid?: () => void;
}

const RaidBannerComponent = ({ onJoinRaid, listeningTime = 0, canClaim = false, onClaimTokens, claiming = false, onEndRaid }: RaidBannerProps) => {
  const { activeRaid, hasClaimed } = useRaid();
  const { user, logout, login, authenticated, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Extract stable values to prevent effect re-runs on object reference changes
  const raidCreatedAt = activeRaid?.createdAt;
  const raidId = activeRaid?.raidId;

  // Update timer using requestAnimationFrame for smoother updates
  useEffect(() => {
    if (!raidCreatedAt) return;

    let rafId: number;
    let lastUpdate = Date.now();

    const updateTimer = () => {
      const now = Date.now();
      // Only update state once per second to avoid excessive re-renders
      if (now - lastUpdate >= 1000) {
        const elapsed = now - raidCreatedAt;
        const remaining = Math.max(0, (30 * 60 * 1000) - elapsed);
        setTimeRemaining(remaining);
        lastUpdate = now;
      }

      rafId = requestAnimationFrame(updateTimer);
    };

    rafId = requestAnimationFrame(updateTimer);

    return () => cancelAnimationFrame(rafId);
  }, [raidCreatedAt, raidId]);

  if (!activeRaid) return null;

  // Check if user is authenticated and has a wallet
  const userWallet = authenticated && user?.wallet?.address ? user.wallet.address : '';
  const hasUserClaimed = hasClaimed(userWallet);

  // Memoize computed values to prevent unnecessary re-calculations
  const isFull = useMemo(() =>
    activeRaid.claimedCount >= activeRaid.maxSeats,
    [activeRaid.claimedCount, activeRaid.maxSeats]
  );

  const isCreator = useMemo(() =>
    userWallet === activeRaid.creatorWallet,
    [userWallet, activeRaid.creatorWallet]
  );

  // Handle wallet connection
  const handleWalletConnect = async () => {
    if (!authenticated) {
      await login();
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <div>
                <div className="font-bold">Raid Active!</div>
                <div className="text-sm opacity-90">
                  {activeRaid.trackName} - {activeRaid.trackArtist}
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-4 text-sm">
              <div>
                <span className="opacity-75">Claimed:</span> <strong>{activeRaid.claimedCount}/{activeRaid.maxSeats}</strong>
              </div>
              <div>
                <span className="opacity-75">Reward:</span> <strong>{activeRaid.tokensPerParticipant} {activeRaid.tokenSymbol}</strong>
              </div>
              <div>
                <span className="opacity-75">Time:</span> <strong>{formatTime(timeRemaining)}</strong>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {!authenticated ? (
              <button
                onClick={handleWalletConnect}
                className="px-6 py-2 bg-white text-purple-600 font-bold rounded-lg hover:bg-gray-100 transition-colors"
              >
                🔐 Connect Wallet to Join
              </button>
            ) : hasUserClaimed ? (
              <div className="px-4 py-2 bg-blue-500 rounded-lg text-sm font-medium">
                ✓ Already Claimed
              </div>
            ) : canClaim ? (
              <button
                onClick={onClaimTokens}
                disabled={claiming}
                className="px-6 py-2 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-300 transition-colors disabled:opacity-50"
              >
                {claiming ? 'Claiming...' : `🎁 Claim ${activeRaid.tokensPerParticipant} Tokens`}
              </button>
            ) : !isFull ? (
              <button
                onClick={onJoinRaid}
                className="px-6 py-2 bg-white text-purple-600 font-bold rounded-lg hover:bg-gray-100 transition-colors"
              >
                {isCreator ? 'Start Listening →' : 'Start Listening →'}
              </button>
            ) : (
              <div className="px-4 py-2 bg-gray-500 rounded-lg text-sm font-medium cursor-not-allowed">
                Raid Full
              </div>
            )}

            {isCreator && onEndRaid && (
              <button
                onClick={onEndRaid}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                End Raid
              </button>
            )}

            {/* Force clear button - always show for stuck raids */}
            {onEndRaid && (
              <button
                onClick={onEndRaid}
                className="px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                title="End raid"
              >
                ❌ Clear Raid
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
export const RaidBanner = memo(RaidBannerComponent, (prevProps, nextProps) => {
  return (
    prevProps.listeningTime === nextProps.listeningTime &&
    prevProps.canClaim === nextProps.canClaim &&
    prevProps.claiming === nextProps.claiming &&
    prevProps.onJoinRaid === nextProps.onJoinRaid &&
    prevProps.onClaimTokens === nextProps.onClaimTokens &&
    prevProps.onEndRaid === nextProps.onEndRaid
  );
});
