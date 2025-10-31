# Volume - Decentralized Music Streaming Raids

A Web3 platform for coordinated Spotify listening campaigns with Solana-based token rewards, powered by on-chain escrow smart contracts.

## 🚀 Features

- **Spotify Web Playback**: Real-time music streaming with premium account support
- **Solana Raids**: Create coordinated listening campaigns with SPL token rewards
- **Smart Contract Escrow**: Trustless token distribution via Anchor program on Solana
- **Token Minting**: Create SPL tokens with Metaplex metadata for raid rewards
- **Cross-Browser Sync**: Real-time raid discovery and participation tracking
- **Wallet Integration**: Privy-powered Solana wallet (Phantom, Solflare, Backpack)
- **Discord Bot Integration**: Manage raids and wallets from Discord
- **Modern Dashboard**: React-based UI with dark/light theme support

---

## 🎯 Raid Mechanism Overview

### What is a Raid?

A **raid** is a coordinated Spotify listening campaign where:
1. A creator selects a track and deposits tokens into an on-chain escrow
2. Participants join and listen to the track for a minimum duration (5 seconds for testing, customizable)
3. After listening, participants claim their token rewards from the escrow
4. All transactions are trustless and handled by a Solana smart contract

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      RAID LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────┘

 CREATION PHASE
┌──────────────┐
│   Creator    │
│  (Browser A) │
└──────┬───────┘
       │
       │ 1. Select Track + Token
       │ 2. Set Parameters (max_seats, tokens_per_participant)
       │ 3. Sign Transaction
       ▼
┌─────────────────────────────────────────────┐
│   Solana Program: initialize_raid()         │
│   Program ID: BLQWXoLgNdxEh7nDrUPFqx...     │
│                                             │
│   • Create PDA: raid_{trackId}_{timestamp}  │
│   • Transfer tokens → Escrow PDA            │
│   • Store: max_seats, tokens_per_participant│
│   • Set expiry: current_time + 30 minutes   │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │  Escrow PDA      │◄──── Holds tokens until claimed
        │  (On-chain)      │
        └──────────────────┘


 PARTICIPATION PHASE
┌──────────────┐         ┌──────────────┐
│ Participant  │         │   Creator    │
│ (Browser B)  │         │ (Browser A)  │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │ 1. Poll blockchain     │ (Every 10 seconds)
       │    getProgramAccounts()│
       │ 2. Discover active raid│
       │ 3. Parse track ID from │
       │    raid_id string      │
       │                        │
       ▼                        ▼
┌────────────────────────────────────┐
│   RaidContext (React Context)      │
│                                    │
│   • Polls Solana every 10s         │
│   • Filters expired raids          │
│   • Parses track URI from raid_id  │
│   • Updates claimedCount/claimedBy │
└────────────────┬───────────────────┘
                 │
                 ▼
       ┌──────────────────┐
       │   Raid Banner    │  ← "Join Raid" button appears
       │   (Top of Page)  │
       └──────────────────┘
                 │
                 │ User clicks "Join Raid"
                 ▼
       ┌──────────────────┐
       │ Spotify Web SDK  │
       │  playTrack(uri)  │  ← Starts playing track
       └──────┬───────────┘
              │
              ▼
     ┌─────────────────┐
     │ Listening Timer │  ← Counts playback time
     │   (useEffect)   │     (5 seconds for testing)
     └─────────┬───────┘
               │
               │ After 5 seconds of playback
               ▼
         Claim Button Appears


 CLAIM PHASE
┌──────────────┐
│ Participant  │
└──────┬───────┘
       │
       │ Click "Claim Tokens"
       ▼
┌─────────────────────────────────────────────┐
│   Solana Program: claim_tokens()            │
│                                             │
│   • Verify raid not expired                 │
│   • Verify user hasn't claimed              │
│   • Verify seats available                  │
│   • Transfer tokens: Escrow PDA → User      │
│   • Update: claimedBy[], claimedCount++     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │  User's Wallet   │  ← Tokens received!
        │  (SPL Token Acct)│
        └──────────────────┘


 CLOSE PHASE
┌──────────────┐
│   Creator    │
└──────┬───────┘
       │
       │ Click "End Raid" or 30 min expires
       ▼
┌─────────────────────────────────────────────┐
│   Solana Program: close_raid()              │
│                                             │
│   • Transfer unclaimed tokens → Creator     │
│   • Close escrow PDA account                │
│   • Recover rent (SOL) → Creator            │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
         Raid Removed from Blockchain
```

---

## 🏗️ Project Structure

### Frontend (Next.js 15 App Router)
```
volume/src/
├── app/
│   ├── dashboard/
│   │   ├── spotify/              # Spotify Web Player + Raid UI
│   │   ├── wallet/               # Token minting interface
│   │   ├── admin/                # Admin controls
│   │   └── layout.tsx            # ← RaidProvider wraps dashboard
│   ├── api/                      # API routes (auth, raids)
│   └── login/                    # Authentication pages
├── components/
│   ├── raids/                    # ← NEW: Raid components
│   │   ├── RaidBanner.tsx        #   Top banner showing active raids
│   │   └── RaidCreationModal.tsx #   Modal for creating raids
│   ├── wallet/
│   │   └── privy-provider.tsx    # Privy wallet integration
│   ├── ui/                       # shadcn/ui components
│   └── layout/                   # Navigation components
├── contexts/                     # ← NEW: React contexts
│   └── RaidContext.tsx           #   Raid state + blockchain polling
├── lib/
│   ├── raid-program.ts           # ← NEW: Program ID & RPC URL
│   ├── idl/
│   │   └── raid_escrow.json      # ← NEW: Anchor IDL for contract
│   ├── types/
│   │   └── raid_escrow.ts        # ← NEW: TypeScript contract types
│   ├── tokenmill-service.ts      # SPL token minting with Metaplex
│   ├── spotify-auth.ts           # Spotify OAuth
│   └── session.ts                # JWT session management
└── types/
    └── raid.ts                   # Raid type definitions
```

### Backend (Node.js/Express/Discord.js)
```
src/
├── routes/                       # Express API routes
│   ├── raids.ts                  # Raid management endpoints
│   ├── spotify.ts                # Spotify OAuth callbacks
│   └── wallet.ts                 # Wallet operations
├── commands/                     # Discord bot commands
│   ├── play.ts                   # Start raid from Discord
│   └── wallet.ts                 # Wallet management
├── services/
│   └── spotify/                  # Spotify service layer
└── database/                     # Prisma client + migrations
```

### Smart Contract (Anchor/Rust)
```
C:\Users\blanc\Desktop\VOLUME-GH\smart contract\raid-escrow\
programs/escrow/src/
├── lib.rs                        # Program entrypoint
├── state/
│   └── raid_escrow.rs            # RaidEscrow account structure
├── handlers/
│   ├── initialize_raid.rs        # Create raid + deposit tokens
│   ├── claim_tokens.rs           # Participant claims rewards
│   └── close_raid.rs             # Return unclaimed tokens
└── error.rs                      # Custom error types

Deployed Program ID (Devnet):
BLQWXoLgNdxEh7nDrUPFqxN3nAFAEho6HiXSdsoJrDRu
```

---

## 📡 Solana Smart Contract Details

### Program Instructions

#### 1. `initialize_raid`
Creates a new raid and deposits tokens into escrow.

**Accounts:**
- `raid_escrow` - PDA to store raid state
- `escrow_token_account` - PDA-owned token account
- `creator` - Raid creator (signer)
- `creator_token_account` - Creator's token account
- `token_mint` - SPL token being distributed

**Arguments:**
- `raid_id: String` - Unique ID (format: `{spotifyTrackId}_{timestamp}`)
- `tokens_per_participant: u64` - Tokens each participant receives
- `max_seats: u8` - Maximum number of participants
- `duration_minutes: u16` - Raid duration (default: 30)

**Flow:**
1. Derive PDA: `seeds = ["raid", raid_id.as_bytes()]`
2. Validate `raid_id.len() <= 64`
3. Create escrow token account owned by PDA
4. Transfer `tokens_per_participant * max_seats` from creator → escrow
5. Store raid state (creator, token_mint, expiry, etc.)

---

#### 2. `claim_tokens`
Allows participant to claim tokens after listening.

**Accounts:**
- `raid_escrow` - PDA with raid state
- `escrow_token_account` - PDA-owned token account
- `participant` - User claiming (signer)
- `participant_token_account` - User's token account
- `token_mint` - SPL token being claimed

**Arguments:**
- `raid_id: String` - Must match raid PDA derivation

**Validations:**
- ✅ Raid not expired
- ✅ User hasn't already claimed
- ✅ Seats still available (`claimed_count < max_seats`)
- ✅ Escrow has sufficient balance

**Flow:**
1. Derive PDA with raid_id
2. Validate conditions
3. Transfer tokens using PDA signature (`invoke_signed`)
4. Add user to `claimed_by` vector
5. Increment `claimed_count`

---

#### 3. `close_raid`
Creator closes raid and recovers unclaimed tokens.

**Accounts:**
- `raid_escrow` - PDA with raid state
- `escrow_token_account` - PDA-owned token account
- `creator` - Raid creator (signer)
- `creator_token_account` - Creator's token account

**Arguments:**
- `raid_id: String`

**Validations:**
- ✅ Only creator can close
- ✅ (Optional) Raid expired or manually closed

**Flow:**
1. Transfer remaining tokens: escrow → creator
2. Close escrow PDA (rent refunded to creator)

---

### RaidEscrow Account Structure

```rust
#[account]
pub struct RaidEscrow {
    pub raid_id: String,              // Max 64 chars
    pub creator: Pubkey,              // Who created the raid
    pub token_mint: Pubkey,           // SPL token being distributed
    pub tokens_per_participant: u64,  // Reward amount (in lamports)
    pub max_seats: u8,                // Maximum participants
    pub claimed_count: u8,            // How many have claimed
    pub created_at: i64,              // Unix timestamp
    pub expires_at: i64,              // Unix timestamp
    pub bump: u8,                     // PDA bump seed
    pub claimed_by: Vec<Pubkey>,      // List of claimers
}
```

**Space Calculation:**
```
8 (discriminator)
+ 4 + 64 (raid_id: String)
+ 32 (creator: Pubkey)
+ 32 (token_mint: Pubkey)
+ 8 (tokens_per_participant: u64)
+ 1 (max_seats: u8)
+ 1 (claimed_count: u8)
+ 8 (created_at: i64)
+ 8 (expires_at: i64)
+ 1 (bump: u8)
+ 4 + (32 * 10) (claimed_by: Vec<Pubkey>)
= ~491 bytes
```

---

## 🔧 Development Setup

### Prerequisites
- Node.js 20+
- pnpm (preferred) or npm
- PostgreSQL database
- Discord Application (for OAuth)
- Spotify Premium Account (for Web Playback SDK)
- Solana wallet (Phantom, Solflare, or Backpack)

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT Secret
JWT_SECRET=your-jwt-secret-here

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/callback/discord

# Spotify OAuth
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=https://your-domain.com/api/auth/callback/spotify

# Privy (Wallet Integration)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# Solana (Raids)
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# App URLs
APP_URL=https://your-domain.com
NEXT_PUBLIC_API_BASE=https://your-api-domain.com
BOT_API_URL=https://your-bot-domain.com
```

### Installation & Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push database schema
pnpm db:push

# Development servers
pnpm dev              # Frontend (Next.js) on :3000
pnpm dev:api          # Backend API on :5000
pnpm dev:bot          # Discord bot

# Production
pnpm build            # Build Next.js
pnpm start            # Start Next.js production server
```

---

## 🎨 Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Utility-first styling
- **@privy-io/react-auth** - Wallet connection (Solana)
- **@coral-xyz/anchor** - Solana smart contract interaction
- **@solana/web3.js** - Solana blockchain client
- **@solana/spl-token** - SPL token operations
- **@metaplex-foundation/mpl-token-metadata** - Token metadata (v2.13.0)
- **Framer Motion** - Animations
- **shadcn/ui** - Component library
- **Spotify Web Playback SDK** - In-browser music streaming

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Discord.js** - Discord bot framework
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **Jose** - JWT handling
- **Spotify Web API** - Music integration

### Blockchain
- **Anchor 0.31** - Solana smart contract framework
- **Solana Devnet** - Blockchain network
- **SPL Token Program** - Token standard

### Infrastructure
- **Railway** - Hosting (database + web app)
- **Docker** - Containerization (planned)

---

## 🎵 Raid Flow Walkthrough

### 1. Creator Creates Raid

**UI:** Dashboard → Spotify → Queue Track → "🎯 Raid" button

**Steps:**
1. User queues a Spotify track
2. Clicks "Raid" button → `RaidCreationModal` opens
3. Selects token from dropdown (pulls from user's wallet)
4. Sets parameters:
   - Tokens per participant: `10`
   - Max participants: `10`
5. Clicks "Create Raid"

**Smart Contract Call:**
```typescript
await program.methods
  .initializeRaid(
    raidId,                    // e.g., "4kVxStqN7DeoZje5aidAn3_729856"
    new BN(10 * 1e9),         // 10 tokens (with 9 decimals)
    10,                        // max_seats
    30                         // 30 minutes duration
  )
  .accounts({
    raidEscrow: raidEscrowPDA,
    escrowTokenAccount,
    creator: creatorPubkey,
    creatorTokenAccount,
    tokenMint: tokenMintPubkey,
    // ...
  })
  .rpc();
```

**Result:**
- Tokens transferred to escrow PDA
- Raid appears on blockchain
- RaidBanner shows at top of page

---

### 2. Participant Discovers Raid (Browser B)

**Automatic Discovery:**
- `RaidContext` polls Solana every 10 seconds
- Calls `connection.getProgramAccounts(RAID_PROGRAM_ID)`
- Filters non-expired raids
- Extracts track ID from `raid_id`:
  ```typescript
  const trackId = raidData.raidId.split('_')[0];  // "4kVxStqN7DeoZje5aidAn3"
  const trackUri = `spotify:track:${trackId}`;
  ```

**UI Updates:**
- RaidBanner appears showing active raid
- Displays track name, reward amount, seats remaining

---

### 3. Participant Joins & Listens

**UI:** Click "Start Listening →" button

**Steps:**
1. User clicks join → Privy prompts wallet connection (if needed)
2. Spotify Web SDK plays the track:
   ```typescript
   fetch(`https://api.spotify.com/v1/me/player/play`, {
     body: JSON.stringify({ uris: [activeRaid.trackUri] })
   });
   ```
3. `useEffect` listening timer starts:
   ```typescript
   useEffect(() => {
     const interval = setInterval(() => {
       playerRef.current.getCurrentState().then((state) => {
         if (state && !state.paused) {
           const position = Math.floor(state.position / 1000);
           if (position >= 5) {
             setCanClaim(true);  // Show claim button!
           }
         }
       });
     }, 1000);
   }, [activeRaid?.raidId]);
   ```

**Result:**
- Music plays in browser
- Timer counts listening duration
- After 5 seconds: "🎁 Claim Tokens" button appears

---

### 4. Participant Claims Tokens

**UI:** Click "🎁 Claim 10 Tokens" button

**Smart Contract Call:**
```typescript
await program.methods
  .claimTokens(raidId)
  .accounts({
    raidEscrow: raidEscrowPDA,
    escrowTokenAccount,
    participant: participantPubkey,
    participantTokenAccount,
    tokenMint: tokenMintPubkey,
    // ...
  })
  .rpc();
```

**On-Chain Validation:**
- ✅ Raid not expired: `current_time < expires_at`
- ✅ User hasn't claimed: `!claimed_by.contains(participant)`
- ✅ Seats available: `claimed_count < max_seats`

**Result:**
- Tokens transferred to user's wallet
- Transaction visible on Solana Explorer
- User added to `claimed_by` array
- Claimed count increments

---

### 5. Creator Closes Raid

**UI:** Click "End Raid" button (creator only)

**Smart Contract Call:**
```typescript
await program.methods
  .closeRaid(raidId)
  .accounts({
    raidEscrow: raidEscrowPDA,
    escrowTokenAccount,
    creator: creatorPubkey,
    creatorTokenAccount,
    // ...
  })
  .rpc();
```

**Result:**
- Unclaimed tokens returned to creator
- Escrow PDA closed (rent refunded)
- Raid disappears from all browsers

---

## 🔐 Security & Trust Model

### Trustless Escrow
- **No custody risk**: Tokens held by PDA (program-owned address)
- **No rug pull**: Creator cannot withdraw after deposit (only close after expiry)
- **Transparent**: All transactions on-chain, verifiable on Solana Explorer

### Validation Layers
1. **Smart Contract**: Validates on-chain (expired, double-claim, seat limits)
2. **Client-side**: Validates listening duration before claiming
3. **Spotify**: Validates premium account and track playback

### Attack Vectors & Mitigations
- **Multiple Claims**: Prevented by `claimed_by` vector check
- **Expired Raid Claim**: Prevented by `expires_at` timestamp check
- **Insufficient Balance**: Prevented by escrow balance check
- **Fake Listening**: Client-side timer (future: could add on-chain Spotify verification)

---

## 📊 Technical Debt & Future Improvements

### High Priority

#### 🔴 Migrate Metaplex v2 → v3 (UMI Framework)
**Current:** Using deprecated `@metaplex-foundation/mpl-token-metadata@2.13.0`
**Impact:** 23 npm vulnerabilities, no future updates
**Effort:** ~2-3 days
**File:** `src/lib/tokenmill-service.ts`

**Why:** Quick hackathon solution - v3 requires UMI framework refactor

**Migration Path:**
1. Install `@metaplex-foundation/umi` + `@metaplex-foundation/umi-bundle-defaults`
2. Create UMI-to-web3.js adapter for Privy wallet signing
3. Replace v2 instructions with UMI builders
4. Test with Privy embedded + external wallets

---

### Medium Priority

#### 🟡 Add On-Chain Listening Verification
**Current:** Client-side timer (5 seconds)
**Future:** Spotify → Oracle → Solana verification
**Why:** Prevent fake claims without actually listening

**Potential Approaches:**
- Clockwork automation to verify Spotify listening state
- Switchboard oracle integration
- Centralized verifier (less ideal but simpler)

---

#### 🟡 IPFS Image Storage for Token Metadata
**Status:** UI ready, storage not configured
**Impact:** Token images won't display in wallets
**Effort:** ~2 hours

**Implementation:**
1. Get API key from https://nft.storage
2. Add `NEXT_PUBLIC_NFT_STORAGE_API_KEY` to env
3. Code ready in `src/lib/ipfs-upload.ts`

---

### Low Priority

#### 🟢 Support Mainnet Deployment
**Current:** Devnet only
**Required:**
- Update `SOLANA_RPC_URL` to mainnet
- Re-deploy smart contract to mainnet
- Update program ID in `raid-program.ts`
- Switch token mints to mainnet addresses

---

## 🚢 Deployment

### Railway (Current)
```bash
# Automatic deployment on git push
git push origin spotify-web-sdk-integration

# Railway auto-runs:
pnpm install
pnpm build
pnpm start
```

### Docker (Planned)
```bash
docker build -t volume-app .
docker run -p 3000:3000 volume-app
```

---

## 🤝 Contributing

### Code Style
- Follow conventional commits
- Use TypeScript strictly
- Component structure: shadcn/ui patterns
- Test all raid flows before merging

### Testing Checklist
- [ ] Raid creation succeeds on-chain
- [ ] Cross-browser raid discovery works
- [ ] Listening timer increments correctly
- [ ] Claim button appears after 5 seconds
- [ ] Claim transaction succeeds
- [ ] Tokens appear in wallet (check Solana Explorer)
- [ ] Raid close returns unclaimed tokens
- [ ] No false error messages

---

## 🔗 Links

- **Deployed App:** https://volume-production-0b31.up.railway.app
- **Solana Program (Devnet):** `BLQWXoLgNdxEh7nDrUPFqxN3nAFAEho6HiXSdsoJrDRu`
- **Solana Explorer:** https://explorer.solana.com/address/BLQWXoLgNdxEh7nDrUPFqxN3nAFAEho6HiXSdsoJrDRu?cluster=devnet
- **Anchor Docs:** https://book.anchor-lang.com/
- **Spotify Web Playback SDK:** https://developer.spotify.com/documentation/web-playback-sdk
- **Privy Docs:** https://docs.privy.io/

---

## 📄 License

Private project - VOLUME

---

## 🌐 Deployment

**Live App:** https://dev.volume.buzz

**Infrastructure:**
- **Railway**: Database hosting + auto-deployment
- **GitHub**: Source control + CI/CD trigger
- **Environment**: All variables managed via Railway dashboard

**Deployment Flow:**
```bash
git push origin spotify-web-sdk-integration
# → Railway auto-builds and deploys
# → Live at dev.volume.buzz
```

---

**Built for VOLUME**
