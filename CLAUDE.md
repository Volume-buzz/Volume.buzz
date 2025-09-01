# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Spotify Discord Bot** with crypto wallet integration that enables music raid campaigns with token rewards. The bot is **Spotify-only** (previously supported Audius but has transitioned away), includes OAuth authentication, real-time raid monitoring, and Solana-based cryptocurrency rewards.

## Architecture

**Three-Component System:**
- `src/app.ts` - Main entry point that orchestrates both bot and API server
- `src/bot.ts` - Discord bot with command handling and OAuth integration
- `src/server.ts` - Express API server for OAuth callbacks and wallet operations

**Key Services:**
- `src/services/oauthServer.ts` - Handles Audius/Spotify OAuth flows with CSRF protection
- `src/services/raidMonitor.ts` - Real-time monitoring of user listening activity
- `src/services/wallet.ts` - Solana wallet management with encrypted private keys
- `src/database/prisma.ts` - Database operations using Prisma ORM with PostgreSQL

**Platform Integration:**
- **Spotify**: OAuth via `/oauth/spotify/login/:sessionId`, premium detection, player tracking, queue management
- **Solana**: Wallet creation, token management, automated settlements via Jupiter API, Helius webhooks

## Common Commands

**Development:**
```bash
npm run dev          # Start both bot and API server with hot reload
npm run dev:bot      # Start only Discord bot
npm run dev:api      # Start only API server
npm run typecheck    # TypeScript type checking
```

**Database:**
```bash
npm run db:push      # Sync Prisma schema to database
npm run db:generate  # Generate Prisma client types
npm run db:studio    # Open Prisma Studio GUI
```

**Production:**
```bash
npm run build        # Compile TypeScript and generate Prisma client
npm run deploy       # Build and start with PM2
npm run start:prod   # Start compiled application
```

## Database Schema

**Primary Models:**
- `User` - Discord users with Audius/Spotify account links, token balances, raid participation
- `Raid` - Music raids with platform (Audius/Spotify), goals, rewards, tracking state
- `RaidParticipant` - User participation in raids with listen duration and qualification status
- `Wallet` - Solana wallets with encrypted private keys per Discord user
- `RewardAccrual` - Pending token rewards awaiting settlement
- `Settlement` - Batch cryptocurrency transfers to user wallets

## Security Implementation

**OAuth Security:**
- CSRF protection via random state parameters stored in `OAuthSession` table
- Platform-specific authentication flows with secure token storage
- Encrypted private key storage using libsodium

**Access Control:**
- Guild-specific raid validation (users can only join raids in their Discord server)
- Admin verification via `Admin` table for sensitive operations
- Rate limiting on API endpoints and authentication flows

**Wallet Security:**
- Private keys encrypted with AES-256-GCM using ENCRYPTION_KEY environment variable
- Withdrawal limits and daily transaction caps
- Transaction validation through Helius webhooks

## Environment Configuration

**Required Variables:**
- `DATABASE_URL` - PostgreSQL connection (supports Railway PostgreSQL and Prisma Postgres)
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` - Discord bot credentials
- `HELIUS_API_KEY` - Solana RPC and webhook services
- `ENCRYPTION_KEY` - For wallet private key encryption (32-byte hex string)
- `JWT_SECRET` - API authentication
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` - Spotify integration
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL
- `BASE_URL` - Base URL for OAuth redirects and embedded players

**Key Settings:**
- `MINIMUM_LISTEN_TIME` - Seconds required to qualify for rewards (default: 60)
- `SUPER_ADMIN_IDS` - Comma-separated Discord IDs with admin privileges
- `SOLANA_NETWORK` - mainnet/devnet/testnet (default: mainnet)

## Command Structure

Discord commands in `src/commands/` follow this pattern:
- Export object with `data` (SlashCommandBuilder) and `execute` function
- Platform-specific authentication checks before execution
- Comprehensive error handling with user-friendly embed responses
- Security validations (guild membership, admin verification, etc.)

## Raid System Flow

1. **Creation**: Admin uses `/raid` command → `Raid` record created → Interactive Discord message posted
2. **Participation**: Users click "Join Raid" → Platform authentication verified → `RaidParticipant` created
3. **Monitoring**: `RaidMonitor` service tracks listening via platform APIs every 10 seconds
4. **Qualification**: Users qualify after `required_listen_time` → `qualified` flag set
5. **Completion**: Raid goal reached → Status changed to COMPLETED → Rewards become claimable
6. **Settlement**: Users claim rewards → `RewardAccrual` created → Automated settlement transfers tokens

## Spotify Integration Details

**Authentication Flow:**
- OAuth with premium detection: `/oauth/spotify/login/:sessionId` → Spotify authorization → `/auth/spotify/callback`
- CSRF protection via state parameters in `OAuthSession` table
- Automatic detection of Premium vs Free accounts

**Tracking Capabilities:**
- **Free Users**: Currently Playing API monitoring with 10-second polling intervals
- **Premium Users**: Enhanced Web Playback SDK integration with real-time tracking
- Premium-only raid support with embedded players and queue management
- Player state monitoring for qualified listening verification

**Key Services:**
- `SpotifyAuthService` - OAuth token management and refresh
- `SpotifyApiService` - Web API interactions and data fetching  
- `SpotifyTrackingService` - Real-time listening progress monitoring
- `SpotifyPlayerService` - Premium user playback control
- `SpotifyMetadataService` - Track data enrichment and caching

## Testing and Quality

**Type Checking:**
```bash
npm run typecheck    # Run TypeScript compiler without output
```

**No Automated Tests:** This codebase currently has no test framework configured. Integration testing is done manually through Discord bot interactions and database inspection.

## Important File Patterns

**Command Structure:**
- Commands in `src/commands/*.ts` export `{ data, execute }` objects
- Use `SlashCommandBuilder` for command definitions  
- Always include comprehensive error handling with `EmbedBuilder.createErrorEmbed()`
- Security checks: admin verification, guild validation, platform authentication

**Route Structure:**
- API routes in `src/routes/*.ts` use Express Router pattern
- Rate limiting applied via `rateLimiter` middleware
- CORS configured for cross-origin requests
- Webhook signature verification for Helius events

**Service Layer:**
- Services are singleton classes with dependency injection
- Database operations isolated in `PrismaDatabase` static methods
- Spotify services organized by functionality (auth, API, tracking, etc.)
- Error handling with structured logging

## Deployment and Production

**PM2 Deployment:**
```bash
npm run deploy       # Build and start with PM2 using ecosystem.config.js
```

**Process Management:**
- `src/app.ts` - Main orchestrator that starts both bot and API server
- `src/bot.ts` - Can run standalone for Discord bot only
- `src/server.ts` - Can run standalone for API server only
- Graceful shutdown handling for all entry points

**Production Considerations:**
- PostgreSQL database required (no SQLite support)
- Helius API key needed for Solana blockchain operations
- SSL/TLS termination handled by reverse proxy (nginx)
- Environment-specific configuration via `.env` files