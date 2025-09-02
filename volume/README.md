# Volume - Discord Music Bot Dashboard

A modern Discord bot platform for coordinated Spotify listening campaigns with cryptocurrency rewards.

## 🚀 Features

- **Discord Integration**: Advanced Discord bot with OAuth authentication
- **Spotify Campaigns**: Coordinated listening raids with reward systems
- **Cryptocurrency Rewards**: Solana-based token distribution
- **Real-time Dashboard**: Modern React dashboard with dark/light theme support
- **Mobile Responsive**: Optimized for all device sizes

## 🏗️ Project Structure

### Frontend (Next.js 15 App Router)
```
volume/src/
├── app/                    # App Router pages and layouts
│   ├── dashboard/         # Dashboard pages (overview, settings, wallet, etc.)
│   ├── api/              # API routes (auth, raids, wallet, etc.)
│   ├── auth/             # Authentication pages
│   └── login/            # Login page
├── components/           # React components
│   ├── core/            # App-wide components (theme, providers)
│   ├── ui/              # Reusable base components (shadcn/ui)
│   ├── layout/          # Navigation and layout components
│   ├── forms/           # Form components and auth flows
│   ├── effects/         # Visual effects and animations
│   ├── landing/         # Landing page components
│   └── dashboard/       # Dashboard-specific components
├── lib/                 # Utility functions and configurations
├── hooks/              # Custom React hooks
└── middleware.ts       # Next.js middleware for auth protection
```

### Backend (Node.js/Express/Discord.js)
```
src/
├── routes/             # Express API routes
├── commands/           # Discord bot commands
├── services/          # Business logic services
├── database/          # Database utilities and Prisma client
├── middleware/        # Express middleware
└── utils/            # Shared utilities
```

## 🛠️ Development Setup

### Prerequisites
- Node.js 20+ 
- pnpm (preferred) or npm
- PostgreSQL database
- Discord Application (for OAuth)
- Spotify Application (for API access)

### Environment Variables
Create `.env` files with:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# JWT Secret
JWT_SECRET=your-jwt-secret-here

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/callback/discord

# App Configuration
APP_URL=https://your-domain.com
NEXT_PUBLIC_API_BASE=https://your-api-domain.com

# Bot Configuration
BOT_API_URL=https://your-bot-domain.com
```

### Installation & Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push

# Development
npm run dev          # Frontend dev server
npm run dev:api      # Backend API server
npm run dev:bot      # Discord bot

# Production
npm run build        # Build frontend
npm run start        # Start frontend
npm run start:api    # Start API server
npm run start:bot    # Start Discord bot
```

## 🎨 Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Animations
- **GSAP** - Advanced animations
- **next-themes** - Dark/light mode support
- **shadcn/ui** - Component library

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Discord.js** - Discord bot framework
- **Prisma** - Database ORM
- **PostgreSQL** - Database
- **Jose** - JWT handling
- **Spotify Web API** - Music integration

### Infrastructure
- **Railway** - Database hosting
- **Docker** - Containerization
- **Railway** - Deployment

## 📱 Component Architecture

### Core Components (`/core`)
- Theme management and app-wide providers

### UI Components (`/ui`) 
- Reusable base components following shadcn/ui patterns
- Buttons, inputs, cards, layouts, etc.

### Layout Components (`/layout`)
- Navigation, sidebars, and app structure

### Feature Components
- Domain-specific components organized by feature area

## 🔐 Authentication Flow

1. User clicks "Get Started" → Discord OAuth
2. Discord callback creates JWT session (7-day expiry)
3. Middleware protects dashboard routes
4. User data synced with backend API

## 🎵 Bot Integration

The bot handles:
- Spotify raid campaigns
- User wallet creation
- Token distribution
- Discord command interactions

## 📦 Deployment

```bash
# Build and deploy
docker build -t volume-app .
docker run -p 3000:3000 volume-app
```

## 🤝 Contributing

1. Follow conventional commits
2. Use TypeScript strictly
3. Follow the established component structure
4. Test thoroughly before deployment

## 📄 License

Private project - Epic Loot Labs