import * as dotenv from 'dotenv';
import * as path from 'path';
import { EnvironmentConfig } from '../types';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Helper function to parse boolean environment variables
const parseBoolean = (value: string | undefined): boolean => {
  return value?.toLowerCase() === 'true' || value === '1';
};

// Helper function to parse number with fallback
const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = value ? parseInt(value, 10) : NaN;
  return isNaN(parsed) ? fallback : parsed;
};

// Helper function to parse float with fallback
const parseFloat = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number(value) : NaN;
  return isNaN(parsed) ? fallback : parsed;
};

// Helper function to parse comma-separated list
const parseList = (value: string | undefined): string[] => {
  return value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
};

// Environment configuration with proper typing and validation
const config = {
  // Database
  database: {
    url: process.env.DATABASE_URL || ''
  },

  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    guildId: process.env.GUILD_ID
  },


  // Spotify
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://volume.epiclootlabs.com/auth/spotify/callback'
  },

  // Solana
  solana: {
    network: (process.env.SOLANA_NETWORK as 'mainnet' | 'devnet' | 'testnet') || 'mainnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  },

  // Helius
  helius: {
    apiKey: process.env.HELIUS_API_KEY || '',
    rpcUrl: process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com',
    webhookSecret: process.env.HELIUS_WEBHOOK_SECRET || '',
    webhookUrl: process.env.HELIUS_WEBHOOK_URL || ''
  },

  // Pyth
  pyth: {
    programId: process.env.PYTH_PROGRAM_ID || 'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH'
  },

  // Jupiter
  jupiter: {
    apiUrl: process.env.JUPITER_API_URL || 'https://lite-api.jup.ag/price/v3',
    routeApiUrl: process.env.JUPITER_ROUTE_API_URL || 'https://quote-api.jup.ag/v6'
  },

  // Security
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
    jwtSecret: process.env.JWT_SECRET || '',
    webhookAuthSecret: process.env.WEBHOOK_AUTH_SECRET || ''
  },

  // Super Admins
  superAdmins: {
    ids: parseList(process.env.SUPER_ADMIN_IDS || '396064737298743308,1196377977831821334')
  },

  // API
  api: {
    port: parseNumber(process.env.PORT, 3000),
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
    corsOrigins: parseList(process.env.ALLOWED_ORIGINS || '*')
  },

  // Bot Settings
  bot: {
    minimumListenTime: parseNumber(process.env.MINIMUM_LISTEN_TIME, 60),
    raidTimeoutSeconds: parseNumber(process.env.RAID_TIMEOUT_SECONDS, 20),
    maxParticipantsPerRaid: parseNumber(process.env.MAX_PARTICIPANTS_PER_RAID, 50)
  },

  // Withdrawal Settings
  withdrawal: {
    minSol: parseFloat(process.env.MIN_WITHDRAWAL_SOL, 1.0),
    feeSol: parseFloat(process.env.WITHDRAWAL_FEE_SOL, 0.01),
    maxDailyWithdrawals: parseNumber(process.env.MAX_DAILY_WITHDRAWALS, 3)
  },

  // Deposit Settings
  deposit: {
    minSol: parseFloat(process.env.MIN_DEPOSIT_SOL, 0.01),
    confirmationBlocks: parseNumber(process.env.DEPOSIT_CONFIRMATION_BLOCKS, 32)
  },

  // Settlement
  settlement: {
    batchThreshold: parseNumber(process.env.BATCH_SETTLEMENT_THRESHOLD, 100),
    intervalMinutes: parseNumber(process.env.SETTLEMENT_INTERVAL_MINUTES, 60),
    maxRetries: parseNumber(process.env.SETTLEMENT_MAX_RETRIES, 3)
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
    maxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    authWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 300000), // 5 minutes
    authMaxRequests: parseNumber(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // Feature Flags
  features: {
    enableWebhooks: parseBoolean(process.env.ENABLE_WEBHOOKS || 'true'),
    enableRewards: parseBoolean(process.env.ENABLE_REWARDS || 'true'),
    enableSettlement: parseBoolean(process.env.ENABLE_SETTLEMENT || 'true'),
    enableMetrics: parseBoolean(process.env.ENABLE_METRICS || 'false'),
    enableSpotifyEmbeddedPlayer: parseBoolean(process.env.ENABLE_SPOTIFY_EMBEDDED_PLAYER || 'true'),
    enableSpotifyEnhancedMetadata: parseBoolean(process.env.ENABLE_SPOTIFY_ENHANCED_METADATA || 'true')
  }
};

// Type-safe environment configuration
export const environment: EnvironmentConfig = {
  // Discord
  discordToken: config.discord.token,
  discordClientId: config.discord.clientId,
  guildId: config.discord.guildId,


  // Database
  databaseUrl: config.database.url,

  // Solana & Helius
  solanaNetwork: config.solana.network,
  heliusApiKey: config.helius.apiKey,
  heliusRpcUrl: config.helius.rpcUrl,
  heliusWebhookUrl: config.helius.webhookUrl,

  // API
  apiPort: config.api.port,
  jwtSecret: config.security.jwtSecret,
  allowedOrigins: config.api.corsOrigins,

  // Admin
  adminDiscordIds: config.superAdmins.ids,

  // Bot settings
  minimumListenTime: config.bot.minimumListenTime,
  nodeEnv: config.api.nodeEnv
};

// Validation
const requiredEnvVars: Array<keyof typeof process.env> = [
  'DATABASE_URL',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'HELIUS_API_KEY',
  'ENCRYPTION_KEY',
  'JWT_SECRET'
];

const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  if (config.api.nodeEnv === 'production') {
    console.error('🚫 Exiting due to missing environment variables in production');
    process.exit(1);
  } else {
    console.warn('⚠️  Running with missing environment variables in development mode');
  }
}

// Validation warnings
if (config.api.nodeEnv === 'production') {
  if (!config.security.webhookAuthSecret) {
    console.warn('⚠️  WEBHOOK_AUTH_SECRET not set in production');
  }
  if (!config.helius.webhookSecret) {
    console.warn('⚠️  HELIUS_WEBHOOK_SECRET not set in production');
  }
}

console.log(`✅ Environment loaded: ${config.api.nodeEnv}`);
console.log(`🌐 Solana Network: ${config.solana.network}`);
console.log(`🤖 Discord Guild: ${config.discord.guildId || 'global'}`);
console.log(`🔐 Super Admins: ${config.superAdmins.ids.length}`);

// Export the complete config object as well for backward compatibility
export default config;
export { config };
