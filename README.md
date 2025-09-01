# Volume - Discord Bot & Dashboard

A comprehensive Discord bot ecosystem with an advanced Next.js dashboard for creating music raid campaigns on the Spotify platform. Users can connect their Spotify accounts, participate in listening raids, and earn cryptocurrency tokens for engagement.

## Project Structure

```
audius/
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

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Fill in all required values:
     - Discord bot token and client ID
     - Spotify client ID and secret
     - Database connection string
     - OAuth callback URL

3. **Database Setup**
   ```bash
   npx prisma db push  # Sync schema to database
   npx prisma generate # Generate Prisma client
   ```

4. **Deploy with PM2**
   ```bash
   npm run deploy
   ```

## Configuration

### Environment Variables

- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `SPOTIFY_CLIENT_ID` - Spotify application client ID
- `SPOTIFY_CLIENT_SECRET` - Spotify application client secret
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL (https://yourdomain.com/auth/spotify/callback)
- `DATABASE_URL` - PostgreSQL connection string
- `HELIUS_API_KEY` - Helius API key for Solana operations
- `ENCRYPTION_KEY` - 32-byte encryption key for wallet security
- `SUPER_ADMIN_IDS` - Comma-separated Discord IDs with admin privileges
- `PORT` - Server port (default: 3000)
- `MINIMUM_LISTEN_TIME` - Minimum listen time to qualify in seconds (default: 30)

## How It Works

1. **User Authentication**: Users use `/login` to connect their Spotify account
2. **Raid Creation**: Admins create raids targeting specific Spotify tracks
3. **User Participation**: Users join raids and listen to the specified track
4. **Progress Tracking**: Bot monitors user activity via Spotify Web API
5. **Reward Distribution**: Qualified users can claim cryptocurrency rewards when raids complete

## Technical Details

- **Database**: Prisma ORM with PostgreSQL and type-safe queries
- **OAuth**: Secure Spotify account linking with state verification
- **Monitoring**: Real-time tracking of Spotify listening activity
- **Real-time Updates**: Discord messages update with live raid progress
- **Crypto Integration**: Solana blockchain for token rewards
- **Type Safety**: Full TypeScript implementation with generated types

## API Integration

- **Spotify Web API**: For track data and user listening tracking
- **Spotify Web Playback SDK**: For premium users with embedded player
- **Discord.js**: For bot functionality and slash commands
- **Express**: For OAuth callback handling
- **Solana Web3.js**: For cryptocurrency operations

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
4. Ensure your app has the required scopes:
   - `user-read-private`
   - `user-read-email`
   - `user-read-playback-state`
   - `user-read-currently-playing`