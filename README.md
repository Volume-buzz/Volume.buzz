# Audius Discord Bot

A Discord bot for creating music raid campaigns on the Audius platform. Users can connect their Audius accounts, participate in listening raids, and earn tokens for engagement.

## Features

### 🔐 Authentication & Profiles
- **OAuth Integration**: Secure Audius account linking with CSRF protection
- **Profile Display**: Rich embeds with profile pictures, cover photos, and bios
- **User Lookup**: Search and view any public Audius user profile
- **Account Management**: View personal stats, token balance, and raid history

### 🎵 Music & Discovery
- **Track Search**: Find tracks on Audius platform with detailed results
- **Music Raids**: Admins can create targeted listening campaigns
- **Real-time Tracking**: Monitor user listening activity via Audius API
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

## Commands

### User Commands
- `/login` - Connect your Audius account to Discord via OAuth
- `/account` - View your connected Audius profile, stats, and raid token balance
- `/leaderboard` - Display top 10 raiders ranked by token count
- `/search <query>` - Search for tracks on Audius platform
- `/lookup <username>` - Look up any Audius user's public profile and stats

### Admin Commands
- `/raid <track> <goal> <reward> [channel] [duration]` - Create a new music raid campaign

## Command Details

### `/login`
- Generates a secure OAuth URL for Audius account linking
- Creates temporary session with CSRF protection
- Sends confirmation DM upon successful connection
- Enables participation in raids and token earning

### `/account`
- Shows your Audius profile picture and cover photo
- Displays social stats (followers, following)
- Shows content stats (tracks, playlists)
- Shows raid token balance and participation history
- Interactive buttons for exploring followers, following, and wallets
- Links to your Audius profile

### `/leaderboard`
- Ranks top 10 users by raid token count
- Shows total raids participated for each user
- Updates automatically every 5 minutes
- Displays Discord usernames with Audius handles

### `/search <query>`
- Searches Audius platform for tracks matching your query
- Returns up to 10 results with track details
- Shows artist, duration, play count, and artwork
- Provides direct links to tracks on Audius
- Useful for finding tracks to raid

### `/lookup <username>`
- Look up any public Audius user profile by username/handle
- Shows profile picture, cover photo, and bio
- Displays social stats, content stats, and engagement metrics
- Shows AUDIO token balance (if public)
- Interactive buttons to explore their tracks, followers, and following
- Links to their Audius profile
- Works with any Audius username (with or without @)

### `/raid <track> <goal> <reward> [channel] [duration]`
*Admin only command*
- **track**: Audius track URL or ID
- **goal**: Number of qualified listeners needed
- **reward**: Token amount each qualified user receives
- **channel**: Discord channel to post raid (defaults to current)
- **duration**: Raid duration in minutes (defaults to 60)

Creates an interactive raid message with:
- Track artwork and details
- Real-time progress bar
- "Join Raid" button for participation
- "Claim Rewards" button (enabled when raid completes)
- Live stream count updates

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Fill in all required values:
     - Discord bot token and client ID
     - Audius API key and secret
     - Database connection string
     - OAuth callback URL

3. **Database Setup**
   ```bash
   npx prisma db push  # Sync schema to database
   npx prisma generate # Generate Prisma client
   ```
   - Database tables are automatically created via Prisma
   - Initial admin is added from environment variable
   - Supports both Prisma Postgres and Railway PostgreSQL

4. **Deploy with PM2**
   ```bash
   npm run deploy
   ```

## Configuration

### Environment Variables

- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `GUILD_ID` - Discord server ID for command deployment
- `ADMIN_DISCORD_ID` - Initial admin Discord user ID
- `DATABASE_URL` - PostgreSQL connection string (supports both Prisma Postgres and Railway PostgreSQL)
- `AUDIUS_API_KEY` - Audius developer API key
- `AUDIUS_API_SECRET` - Audius developer API secret
- `OAUTH_CALLBACK_URL` - OAuth callback URL (https://yourdomain.com/oauth/callback)
- `PORT` - Server port (default: 3000)
- `DEFAULT_RAID_DURATION` - Default raid duration in minutes (default: 60)
- `MINIMUM_LISTEN_TIME` - Minimum listen time to qualify in seconds (default: 30)

### Database Options

#### Railway PostgreSQL
To use Railway PostgreSQL, set your `DATABASE_URL` to:
```
DATABASE_URL="postgresql://username:password@hostname:port/database"
```

#### Prisma Postgres
To use Prisma Postgres, set your `DATABASE_URL` to:
```
DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=your_api_key"
```

## How It Works

1. **User Authentication**: Users use `/login` to connect their Audius account
2. **Raid Creation**: Admins create raids targeting specific Audius tracks
3. **User Participation**: Users join raids and listen to the specified track
4. **Progress Tracking**: Bot monitors user activity via Audius "now playing" API
5. **Reward Distribution**: Qualified users can claim token rewards when raids complete

## Technical Details

- **Database**: Prisma ORM with PostgreSQL and type-safe queries
- **OAuth**: Secure Audius account linking with state verification
- **Monitoring**: Cron jobs track listening progress every 30 seconds
- **Real-time Updates**: Discord messages update with live raid progress
- **Error Handling**: Comprehensive error handling and user feedback
- **Type Safety**: Auto-generated TypeScript types from Prisma schema

## API Integration

- **Audius SDK**: For track resolution and user data
- **Audius REST API**: For "now playing" tracking
- **Discord.js**: For bot functionality and slash commands
- **Express**: For OAuth callback handling

## Security

- OAuth state verification prevents CSRF attacks
- Database parameterized queries prevent SQL injection
- Ephemeral responses for sensitive commands
- Admin-only commands with database verification

## Deployment

The bot is designed for PM2 deployment with:
- Automatic restarts on crashes
- Log file management
- Production environment configuration
- Graceful shutdown handling 