// Main type definitions for the Audius Discord Bot

import { ChatInputCommandInteraction, SlashCommandBuilder, ButtonInteraction, User as DiscordUser } from 'discord.js';

// Command interface
export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// User types
export interface AudiusUser {
  id: string;
  name: string;
  handle: string;
  bio?: string;
  profilePicture?: string;
  followerCount: number;
  followeeCount: number;
  trackCount: number;
  isVerified?: boolean;
}

export interface DatabaseUser {
  id: number;
  discord_id: string;
  audius_user_id?: string;
  audius_handle?: string;
  audius_name?: string;
  tokens_balance: number;
  total_raids_participated: number;
  total_rewards_claimed: number;
  role: UserRole;
  created_at: Date;
  last_updated: Date;
}

export type UserRole = 'fan' | 'artist' | 'super_admin';

// Raid types
export interface Raid {
  id: number;
  track_id: string;
  track_url: string;
  track_title: string;
  track_artist: string;
  track_artwork_url?: string;
  streams_goal: number;
  current_streams: number;
  reward_amount: number;
  reward_token_mint?: string;
  channel_id: string;
  guild_id: string;
  creator_id: string;
  duration_minutes: number;
  status: RaidStatus;
  message_id?: string;
  first_finisher_discord_id?: string;
  first_finisher_handle?: string;
  first_finisher_time?: Date;
  created_at: Date;
  expires_at: Date;
  completed_at?: Date;
}

export type RaidStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface RaidParticipant {
  id: number;
  raid_id: number;
  discord_id: string;
  audius_user_id: string;
  listen_start_time?: Date;
  total_listen_duration: number;
  last_check?: Date;
  is_listening: boolean;
  qualified: boolean;
  qualified_at?: Date;
  claimed_reward: boolean;
  claimed_at?: Date;
  created_at: Date;
}

// Wallet types
export interface Wallet {
  id: number;
  userId: number;
  publicKey: string;
  encryptedPrivateKey: string;
  isArtistWallet: boolean;
  createdAt: Date;
  exportedAt?: Date;
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  amount: number;
  decimals: number;
  uiAmount: number;
}

export interface WalletBalance {
  sol: number;
  tokens: TokenBalance[];
}

// API types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

// Service interfaces
export interface OAuthCallbackData {
  code: string;
  state: string;
}

export interface TrackSearchResult {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  permalink: string;
  duration: number;
  playCount: number;
  releaseDate?: string;
  genre?: string;
}

// Webhook types
export interface HeliusWebhookEvent {
  accountData: any[];
  blockchain: string;
  description: string;
  events: any;
  fee: number;
  feePayer: string;
  instructions: any[];
  nativeTransfers: any[];
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: HeliusTokenTransfer[];
  transactionError?: string;
  type: string;
}

export interface HeliusTokenTransfer {
  fromTokenAccount: string;
  toTokenAccount: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

// Environment configuration
export interface EnvironmentConfig {
  // Discord
  discordToken: string;
  discordClientId: string;
  guildId?: string;
  
  // Audius
  audiusApiKey?: string;
  audiusApiUrl: string;
  
  // Database
  databaseUrl: string;
  
  // Solana & Helius
  solanaNetwork: 'mainnet' | 'devnet' | 'testnet';
  heliusApiKey: string;
  heliusRpcUrl: string;
  heliusWebhookUrl: string;
  
  // API
  apiPort: number;
  jwtSecret: string;
  allowedOrigins: string[];
  
  // Admin
  adminDiscordIds: string[];
  
  // Bot settings
  minimumListenTime: number;
  nodeEnv: 'development' | 'production' | 'test';
}

// Express middleware types
export interface AuthenticatedRequest extends Express.Request {
  user?: DatabaseUser;
  discordUser?: DiscordUser;
}

// Price Oracle types
export interface TokenPrice {
  mint: string;
  price: number;
  symbol: string;
  lastUpdated: Date;
}

// Settlement types
export interface SettlementBatch {
  id: string;
  transactions: SettlementTransaction[];
  totalAmount: number;
  tokenMint: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
}

export interface SettlementTransaction {
  userId: number;
  amount: number;
  toAddress: string;
  transactionHash?: string;
}

// Crypto reward claiming
export interface RewardClaimResult {
  amount: number;
  tokenMint: string;
  transactionHash: string;
  settlement?: boolean;
}
