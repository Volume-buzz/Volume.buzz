# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Development Commands

### Discord Bot (TypeScript/Node.js)
```bash
# Development (with auto-reload)
npm run dev           # Run both bot and API server
npm run dev:bot       # Run Discord bot only  
npm run dev:api       # Run API server only

# Building and production
npm run build         # Compile TypeScript and generate Prisma client
npm run start         # Run both bot and API (after build)
npm run start:bot     # Run Discord bot only (after build)
npm run start:api     # Run API server only (after build)

# Type checking
npm run typecheck     # Run TypeScript compiler without emitting files

# Database operations
npm run db:push       # Sync Prisma schema to database
npm run db:generate   # Generate Prisma client
npm run db:studio     # Open Prisma Studio GUI

# Deployment
npm run deploy        # Build and deploy with PM2
```

### Next.js Dashboard (from `volume/` directory)
```bash
cd volume/

# Development
pnpm dev              # Start Next.js dev server

# Production
pnpm build            # Build for production
pnpm start            # Start production server

# Linting
pnpm lint             # Run ESLint with Next.js config
```

## Architecture Overview

### Project Structure
- **Backend (Node.js + TypeScript)**: Discord bot with Express API server
- **Frontend (Next.js)**: Modern dashboard with real-time analytics in `volume/` directory
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: Solana Web3.js for cryptocurrency rewards

### Key Components

#### Discord Bot (`src/`)
- **Entry Points**: `app.ts` (combined), `bot.ts` (bot only), `server.ts` (API only)
- **Commands**: Slash commands in `src/commands/` (login, account, raid, wallet operations)
- **Services**: Core business logic including OAuth, Spotify integration, wallet management
- **Routes**: Express API endpoints for frontend integration
- **Database**: Prisma client at `src/database/prisma.ts`

#### Next.js Dashboard (`volume/src/`)
- **Pages**: App Router structure in `src/app/`
- **Components**: React components with TypeScript in `src/components/`
- **Libraries**: Shared utilities in `src/lib/`

### Core Services
- **OAuth**: Spotify account linking with CSRF protection (`src/services/oauthServer.ts`)
- **Raid Monitor**: Real-time listening tracking (`src/services/raidMonitor.ts`)
- **Wallet Service**: Solana wallet creation and management (`src/services/wallet.ts`)
- **Spotify Integration**: API calls and user tracking (`src/services/spotify/`)

### Database Schema
The Prisma schema (`prisma/schema.prisma`) includes:
- **Users**: Discord + Spotify account linking, token balances, roles
- **Raids**: Music listening campaigns with goals and rewards
- **Wallets**: Encrypted Solana private keys per user
- **Tokens**: Cryptocurrency reward system
- **Participation Tracking**: Real-time listening progress

## Path Aliases (Backend)
TypeScript path mapping configured in `tsconfig.json`:
- `@/*` → `src/*`
- `@/types/*` → `src/types/*`
- `@/services/*` → `src/services/*`
- `@/database/*` → `src/database/*`
- `@/utils/*` → `src/utils/*`
- `@/commands/*` → `src/commands/*`

## Environment Configuration
- **Bot**: `.env` in root directory
- **Dashboard**: `.env` in `volume/` directory
- Critical variables: `DATABASE_URL`, Discord/Spotify OAuth credentials, encryption keys

## Testing
No test framework currently configured. When adding tests:
- Colocate as `*.test.ts` beside source files
- Prefer Jest or Vitest with TypeScript support

## Package Management
- **Bot**: npm with `package-lock.json`
- **Dashboard**: pnpm with `pnpm-lock.yaml`

## Database Workflow
After modifying `prisma/schema.prisma`:
1. `npm run db:generate` - Update Prisma client
2. `npm run db:push` - Sync changes to database