'use client';

import { useRaid } from '@/contexts/RaidContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useState, useEffect, useMemo, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TextureButton } from '@/components/ui/texture-button';
import { 
  Target, 
  Play, 
  Gift, 
  X, 
  Clock, 
  Users, 
  Coins,
  Wallet,
  Music
} from 'lucide-react';

interface RaidDynamicIslandProps {
  onJoinRaid: () => void;
  listeningTime?: number;
  canClaim?: boolean;
  onClaimTokens?: () => void;
  claiming?: boolean;
  onEndRaid?: () => void;
}

// Animation variants for smooth transitions
const BOUNCE_VARIANTS = {
  idle: 0.5,
  expanded: 0.3,
} as const;

// Separate timer component to isolate re-renders
const RaidTimer = memo(({ expiresAt }: { expiresAt: number }) => {
  // Initialize with current value immediately
  const [timeRemaining, setTimeRemaining] = useState<number>(() =>
    Math.max(0, expiresAt - Date.now())
  );

  useEffect(() => {
    let rafId: number;
    let lastUpdate = Date.now();

    const updateTimer = () => {
      const now = Date.now();
      if (now - lastUpdate >= 1000) {
        const remaining = Math.max(0, expiresAt - now);
        setTimeRemaining(remaining);
        lastUpdate = now;
      }
      rafId = requestAnimationFrame(updateTimer);
    };

    rafId = requestAnimationFrame(updateTimer);
    return () => cancelAnimationFrame(rafId);
  }, [expiresAt]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return <>{formatTime(timeRemaining)}</>;
});

const RaidDynamicIslandComponent = ({
  onJoinRaid,
  listeningTime = 0,
  canClaim = false,
  onClaimTokens,
  claiming = false,
  onEndRaid
}: RaidDynamicIslandProps) => {
  const { activeRaid, hasClaimed } = useRaid();
  const { user, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [isExpanded, setIsExpanded] = useState(false);

  const formatListeningTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  // Check if user is authenticated and has a wallet
  const userWallet = authenticated && user?.wallet?.address ? user.wallet.address : '';
  const hasUserClaimed = hasClaimed(userWallet);

  // Memoize computed values to prevent unnecessary re-calculations
  // IMPORTANT: These hooks MUST be called before the early return to avoid React error #310
  const isFull = useMemo(() =>
    activeRaid ? activeRaid.claimedCount >= activeRaid.maxSeats : false,
    [activeRaid?.claimedCount, activeRaid?.maxSeats]
  );

  const isCreator = useMemo(() =>
    activeRaid ? userWallet === activeRaid.creatorWallet : false,
    [userWallet, activeRaid?.creatorWallet]
  );

  if (!activeRaid) return null;

  // Handle wallet connection
  const handleWalletConnect = async () => {
    if (!authenticated) {
      await login();
    }
  };

  // Compact view content
  const CompactContent = () => (
    <motion.div
      className="flex items-center gap-3 px-4 py-2 cursor-pointer"
      onClick={() => setIsExpanded(true)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Target className="h-5 w-5 text-purple-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          🎯 Raid Active
        </p>
        <p className="text-xs text-white/70 truncate">
          {activeRaid.trackName} - {activeRaid.trackArtist}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-white/60">
        <Users className="h-3 w-3" />
        <span>{activeRaid.claimedCount}/{activeRaid.maxSeats}</span>
        <Clock className="h-3 w-3 ml-1" />
        <span><RaidTimer expiresAt={activeRaid.expiresAt} /></span>
      </div>
    </motion.div>
  );

  // Expanded view content
  const ExpandedContent = () => (
    <motion.div
      className="w-96 px-4 py-3"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-purple-400" />
          <span className="text-sm font-semibold text-white">Active Raid</span>
        </div>
        <TextureButton
          variant="icon"
          size="icon"
          onClick={() => setIsExpanded(false)}
          className="w-6 h-6"
        >
          <X className="h-3 w-3" />
        </TextureButton>
      </div>

      {/* Track Info */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Music className="h-4 w-4 text-green-400" />
          <p className="text-sm font-medium text-white truncate">
            {activeRaid.trackName}
          </p>
        </div>
        <p className="text-xs text-white/70 ml-6">
          by {activeRaid.trackArtist}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <Users className="h-4 w-4 text-blue-400 mx-auto mb-1" />
          <p className="text-xs text-white/60">Participants</p>
          <p className="text-sm font-medium text-white">
            {activeRaid.claimedCount}/{activeRaid.maxSeats}
          </p>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <Coins className="h-4 w-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-xs text-white/60">Reward</p>
          <p className="text-sm font-medium text-white">
            {activeRaid.tokensPerParticipant} {activeRaid.tokenSymbol}
          </p>
        </div>
        <div className="bg-white/5 rounded-lg p-2 text-center">
          <Clock className="h-4 w-4 text-orange-400 mx-auto mb-1" />
          <p className="text-xs text-white/60">Time Left</p>
          <p className="text-sm font-medium text-white">
            <RaidTimer expiresAt={activeRaid.expiresAt} />
          </p>
        </div>
      </div>

      {/* Listening Progress */}
      {listeningTime > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/60">Listening Progress</span>
            <span className="text-xs text-white/60">{formatListeningTime(listeningTime)}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-green-400 to-blue-500"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.min((listeningTime / 30000) * 100, 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {!authenticated ? (
          <TextureButton
            variant="accent"
            size="sm"
            onClick={handleWalletConnect}
            className="flex-1"
          >
            <Wallet className="h-4 w-4 mr-2" />
            Connect Wallet
          </TextureButton>
        ) : hasUserClaimed ? (
          <div className="flex-1 px-3 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-center">
            <span className="text-sm text-blue-300">✓ Already Claimed</span>
          </div>
        ) : canClaim ? (
          <TextureButton
            variant="accent"
            size="sm"
            onClick={onClaimTokens}
            disabled={claiming}
            className="flex-1"
          >
            <Gift className="h-4 w-4 mr-2" />
            {claiming ? 'Claiming...' : `Claim ${activeRaid.tokensPerParticipant} Tokens`}
          </TextureButton>
        ) : !isFull ? (
          <TextureButton
            variant="accent"
            size="sm"
            onClick={onJoinRaid}
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Listening
          </TextureButton>
        ) : (
          <div className="flex-1 px-3 py-2 bg-gray-500/20 border border-gray-500/30 rounded-lg text-center">
            <span className="text-sm text-gray-300">Raid Full</span>
          </div>
        )}
      </div>

      {/* End/Clear Raid button - one button for all users */}
      {onEndRaid && (
        <div className="mt-2">
          <TextureButton
            variant="destructive"
            size="sm"
            onClick={onEndRaid}
            className="w-full"
          >
            <X className="h-4 w-4 mr-2" />
            {isCreator ? 'End Raid' : 'Clear Raid'}
          </TextureButton>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <motion.div
        layout="position"
        transition={{
          type: "spring",
          bounce: BOUNCE_VARIANTS[isExpanded ? 'expanded' : 'idle'],
          duration: 0.6
        }}
        style={{ borderRadius: 24 }}
        className="overflow-hidden bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isExpanded ? (
            <div key="expanded">
              <ExpandedContent />
            </div>
          ) : (
            <div key="compact">
              <CompactContent />
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
export const RaidDynamicIsland = memo(RaidDynamicIslandComponent, (prevProps, nextProps) => {
  return (
    prevProps.listeningTime === nextProps.listeningTime &&
    prevProps.canClaim === nextProps.canClaim &&
    prevProps.claiming === nextProps.claiming &&
    prevProps.onJoinRaid === nextProps.onJoinRaid &&
    prevProps.onClaimTokens === nextProps.onClaimTokens &&
    prevProps.onEndRaid === nextProps.onEndRaid
  );
});

