# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Audius Discord Bot with crypto wallet integration that enables music raid campaigns with token rewards. The bot supports both Audius and Spotify platforms, includes OAuth authentication, real-time raid monitoring, and Solana-based cryptocurrency rewards.

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
- **Audius**: OAuth via `/oauth/audius/login/:sessionId`, track search, listening monitoring
- **Spotify**: OAuth via `/oauth/spotify/login/:sessionId`, premium detection, player tracking
- **Solana**: Wallet creation, token management, automated settlements via Jupiter API

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
- `ENCRYPTION_KEY` - For wallet private key encryption
- `JWT_SECRET` - API authentication
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` - Spotify integration

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

## Multi-Platform Support

**Audius Integration:**
- OAuth flow: `/oauth/audius/login/:sessionId` → Audius authorization → `/auth/audius/callback`
- "Now Playing" API monitoring for raid participation tracking
- Track search and profile lookup functionality

**Spotify Integration:**
- OAuth with premium detection: `/oauth/spotify/login/:sessionId` → Spotify authorization → `/auth/spotify/callback`
- Premium-only raid support with enhanced tracking
- Player state monitoring for qualified listening verification