# Audius Discord Bot

A Discord bot for creating music raid campaigns on the Audius platform. Users can connect their Audius accounts, participate in listening raids, and earn tokens for engagement.

## Features

- **OAuth Integration**: Users can link their Audius accounts to Discord
- **Music Raids**: Admins can start raids for specific tracks
- **Real-time Tracking**: Bot monitors user listening activity on Audius
- **Token Rewards**: Users earn tokens for qualified listening sessions
- **Leaderboards**: Track top raiders by token count
- **Progress Monitoring**: Real-time raid progress updates

## Commands

### User Commands
- `/login` - Connect your Audius account to Discord
- `/account` - View your Audius profile and token balance
- `/leaderboard` - View top 10 raiders by token count

### Admin Commands
- `/raid <track> <goal> <reward> [channel] [duration]` - Start a music raid

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
   - Database tables are automatically created
   - Initial admin is added from environment variable

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
- `DATABASE_URL` - PostgreSQL connection string
- `AUDIUS_API_KEY` - Audius developer API key
- `AUDIUS_API_SECRET` - Audius developer API secret
- `OAUTH_CALLBACK_URL` - OAuth callback URL (https://yourdomain.com/oauth/callback)
- `PORT` - Server port (default: 3000)
- `DEFAULT_RAID_DURATION` - Default raid duration in minutes (default: 60)
- `MINIMUM_LISTEN_TIME` - Minimum listen time to qualify in seconds (default: 30)

## How It Works

1. **User Authentication**: Users use `/login` to connect their Audius account
2. **Raid Creation**: Admins create raids targeting specific Audius tracks
3. **User Participation**: Users join raids and listen to the specified track
4. **Progress Tracking**: Bot monitors user activity via Audius "now playing" API
5. **Reward Distribution**: Qualified users can claim token rewards when raids complete

## Technical Details

- **Database**: PostgreSQL with connection pooling
- **OAuth**: Secure Audius account linking with state verification
- **Monitoring**: Cron jobs track listening progress every 30 seconds
- **Real-time Updates**: Discord messages update with live raid progress
- **Error Handling**: Comprehensive error handling and user feedback

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