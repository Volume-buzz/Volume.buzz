# Volume - Discord Bot & Dashboard

A comprehensive Discord bot ecosystem with an advanced Next.js dashboard for creating music raid campaigns on the Spotify platform. Users can connect their Spotify accounts, participate in listening raids, and earn cryptocurrency tokens for engagement.

## Project Structure

```
volume/
├── src/                    # Discord Bot (Node.js + TypeScript)
│   ├── bot.ts             # Main bot entry point
│   ├── commands/          # Slash commands
│   ├── services/          # OAuth, Spotify, Wallet services
│   ├── database/          # Prisma database layer
│   └── routes/            # Express API routes
├── volume/                # Next.js Dashboard
│   ├── src/
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities
│   ├── public/            # Static assets
│   └── package.json       # Dashboard dependencies
├── prisma/                # Database schema & migrations
├── package.json           # Bot dependencies
└── README.md              # This file
```

## Features

### 🌐 Next.js Dashboard
- **Modern UI**: Beautiful landing page with neural network animations
- **Discord OAuth**: Secure Discord login integration 
- **Spotify OAuth**: Seamless Spotify account connection flow
- **Real-time Analytics**: Live bot performance and user engagement metrics
- **Admin Controls**: Advanced bot management and configuration
- **Responsive Design**: Mobile-first design with modern animations
- **TypeScript**: Full type safety across the dashboard

### 🔐 Authentication & Profiles
- **OAuth Integration**: Secure Spotify account linking with CSRF protection
- **Profile Display**: Rich embeds with profile pictures and account information
- **Premium Detection**: Automatic detection of Spotify Premium accounts
- **Account Management**: View personal stats, token balance, and raid history

### 🎵 Music & Discovery
- **Track Search**: Find tracks on Spotify platform with detailed results
- **Music Raids**: Admins can create targeted listening campaigns
- **Real-time Tracking**: Monitor user listening activity via Spotify API
- **Progress Updates**: Live raid progress with visual progress bars

### 🏆 Gamification & Rewards
- **Token System**: Earn tokens for qualified listening sessions (60+ seconds)
- **Leaderboards**: Rank top raiders by token count and participation
- **Interactive Rewards**: Click-to-claim rewards system
- **Progress Monitoring**: Personal DMs with listening progress updates

### 🤖 Bot Intelligence
- **Smart Monitoring**: Detects when users start/stop playing raid tracks
- **Auto-qualification**: Automatically qualifies users after minimum listen time
- **Raid Completion**: Auto-completes raids when goals are reached
- **Error Recovery**: Robust error handling with user-friendly messages

### 💳 Crypto Integration
- **Solana Wallets**: Automatic wallet creation for each user
- **Token Rewards**: Real cryptocurrency rewards for participation
- **Secure Storage**: Encrypted private key storage
- **Withdrawal System**: Users can withdraw earned tokens

## Commands

### User Commands
- `/login` - Connect your Spotify account to Discord via OAuth
- `/account` - View your connected Spotify profile, stats, and raid token balance
- `/wallet` - View your Solana wallet balance and export private key
- `/leaderboard` - Display top 10 raiders ranked by token count
- `/logout` - Disconnect your Spotify account from the bot

### Admin Commands
- `/raid <track> <goal> <reward> [channel] [duration]` - Create a new music raid campaign
- `/add-artist <discord_user>` - Grant artist role to a user
- `/deposit <amount> [token_mint]` - Deposit tokens for raid rewards
- `/tokens` - Manage token configurations

## Setup

### Prerequisites
- Node.js 18.18+ 
- PostgreSQL database
- Discord Application ([Discord Developer Portal](https://discord.com/developers/applications))
- Spotify Application ([Spotify Developer Dashboard](https://developer.spotify.com/dashboard))
- pnpm (for dashboard) or npm (for bot)

### 🤖 Discord Bot Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Database Setup**
   ```bash
   npx prisma db push     # Sync schema to database
   npx prisma generate    # Generate Prisma client
   ```

4. **Run Development**
   ```bash
   # Development with TypeScript and auto-reload:
   npm run dev           # Run both bot and API server
   npm run dev:bot       # Run bot only
   npm run dev:api       # Run API server only

   # Production builds:
   npm run build        # Build TypeScript to JavaScript
   npm start           # Run both bot and API (after build)
   npm run start:bot   # Run bot only (after build)
   npm run start:api   # Run API only (after build)

   # Production with pre-built files:
   npm run start:prod      # Run both from dist/
   npm run start:prod:bot  # Run bot from dist/
   npm run start:prod:api  # Run API from dist/
   ```

5. **Deploy with PM2**
   ```bash
   npm run deploy
   ```

### 🌐 Dashboard Setup

1. **Navigate to Dashboard**
   ```bash
   cd volume
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Run Development**
   ```bash
   pnpm dev
   ```

4. **Build for Production**
   ```bash
   pnpm build
   pnpm start
   ```

### 🚀 Railway Deployment

The dashboard is configured for Railway deployment:

1. Connect your GitHub repository to Railway
2. Set root directory to `/volume` in Railway settings
3. Environment variables are automatically detected
4. Deploy with automatic builds on push

## Configuration

### Environment Variables

#### Required for Both Bot & Dashboard
- `DATABASE_URL` - PostgreSQL connection string
- `DISCORD_CLIENT_ID` - Discord application client ID
- `DISCORD_CLIENT_SECRET` - Discord application client secret
- `AUDIUS_API_KEY` - Audius developer app client ID used for OAuth login
- `AUDIUS_APP_NAME` - Application name to send with Audius API requests (e.g. `volume-bot`)
- `API_PUBLIC_URL` - Publicly reachable URL for the API server (e.g. `https://bot.yourdomain.com`)

#### Bot-Specific
- `DISCORD_TOKEN` - Discord bot token
- `HELIUS_API_KEY` - Helius API key for Solana operations
- `ENCRYPTION_KEY` - 32-byte encryption key for wallet security (base64)
- `JWT_SECRET` - Secret for JWT token signing
- `SUPER_ADMIN_IDS` - Comma-separated Discord IDs with admin privileges
- `PORT` - Bot server port (default: 4003)
- `MINIMUM_LISTEN_TIME` - Minimum listen time to qualify in seconds (default: 60)

#### Dashboard-Specific (Next.js)
- `NEXTAUTH_SECRET` - NextAuth.js secret (when using Better Auth)
- `NEXTAUTH_URL` - Dashboard URL for OAuth callbacks

#### Optional Configuration
- `AUDIUS_LOGIN_REDIRECT_URL` - Override the default Audius OAuth callback route
- `AUDIUS_API_SECRET` - Provide only if you plan to perform authorized write operations via the Audius SDK
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REDIRECT_URI` - Only required if Spotify features are re-enabled
- `SOLANA_NETWORK` - mainnet, devnet, or testnet (default: mainnet)
- `SOLANA_RPC_URL` - Custom Solana RPC endpoint
- `NODE_ENV` - Environment (development, production)
- `LOG_LEVEL` - Logging level (info, debug, error)

## How It Works

1. **User Authentication**: Users run `/login` to connect their Audius account
2. **Raid Creation**: Admins create raids targeting supported tracks
3. **User Participation**: Users join raids and follow the listening instructions
4. **Progress Tracking**: The bot monitors participation and validates completion
5. **Reward Distribution**: Qualified users can claim cryptocurrency rewards when raids complete

## Technical Stack

### 🤖 Discord Bot (Node.js + TypeScript)
- **Framework**: Node.js with TypeScript
- **Discord**: Discord.js v14 with slash commands
- **Database**: Prisma ORM with PostgreSQL
- **Authentication**: Custom OAuth implementation with CSRF protection
- **Crypto**: Solana Web3.js for blockchain operations
- **Security**: AES-256-GCM encryption for private keys
- **Deployment**: PM2 with auto-restart and log management

### 🌐 Dashboard (Next.js + TypeScript)
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: Custom React components with animations
- **3D Graphics**: Three.js with React Three Fiber
- **Animations**: Framer Motion + GSAP
- **Fonts**: Inter font with variable font support
- **Authentication**: Better Auth (planned) for Discord OAuth
- **Deployment**: Railway with automatic builds

### 🗄️ Shared Infrastructure
- **Database**: PostgreSQL with Prisma schema
- **OAuth Providers**: Discord & Spotify OAuth 2.0
- **APIs**: Spotify Web API, Discord API, Solana RPC
- **Security**: JWT tokens, encrypted storage, rate limiting

## API Integration

- **Spotify Web API**: Track data and user listening tracking
- **Spotify Web Playback SDK**: Premium users with embedded player
- **Discord.js**: Bot functionality and slash commands
- **Express**: OAuth callback handling and API routes
- **Solana Web3.js**: Cryptocurrency operations and wallet management
- **Helius**: Enhanced Solana API with webhooks

## Security

- OAuth state verification prevents CSRF attacks
- Encrypted private key storage using AES-256-GCM
- Database parameterized queries prevent SQL injection
- Admin-only commands with database verification
- Rate limiting on authentication endpoints

## Deployment

The bot is designed for PM2 deployment with:
- Automatic restarts on crashes
- Log file management
- Production environment configuration
- Graceful shutdown handling

## Spotify API Setup

1. Create a Spotify app at https://developer.spotify.com/dashboard
2. Add your redirect URI: `https://yourdomain.com/auth/spotify/callback`
3. Copy your Client ID and Client Secret to your `.env` file
