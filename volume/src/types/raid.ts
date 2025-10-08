export interface RaidTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  addedAt: number;
  artworkUrl?: string;
  duration?: number;
  spotifyUrl?: string;
}

export interface QueuedTrack {
  id: string;
  uri: string;
  name: string;
  artist: string;
  addedAt: number;
}

export interface RaidTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  supply: number;
  // Additional metadata for raids
  spotifyTrackId?: string;
  spotifyArtist?: string;
  raidDuration?: number;
  // Social links for enhanced metadata
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface TokenCreationForm {
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  initialSupply: number;
  spotifyTrackId?: string;
  artistName?: string;
  description?: string;
}

export interface RaidConfig {
  selectedTrack: RaidTrack | null;
  tokenMetadata: RaidTokenMetadata | null;
  duration: number; // in minutes
  maxParticipants?: number;
  rewardPerParticipant: number;
}

export interface MintResult {
  mintAddress: string;
  transactionSignature: string;
  tokenAccountAddress: string;
  success: boolean;
  error?: string;
}

export interface RaidParticipant {
  userId: string;
  walletAddress: string;
  joinedAt: number;
  listeningVerified: boolean;
  rewardsClaimed: boolean;
}

export interface ActiveRaid {
  id: string;
  trackId: string;
  trackName: string;
  trackArtist: string;
  mintAddress: string;
  creatorWallet: string;
  createdAt: number;
  duration: number;
  participants: RaidParticipant[];
  status: 'pending' | 'active' | 'completed' | 'cancelled';
}
