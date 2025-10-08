import type { NextConfig } from "next";
// import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://sdk.scdn.co", // Next.js needs unsafe-eval and unsafe-inline
      "style-src 'self' 'unsafe-inline' https://cdn.hugeicons.com", // Added HugeIcons CDN
      "img-src 'self' data: https: https://cdn.discordapp.com https://i.scdn.co",
      "font-src 'self' data: https://cdn.hugeicons.com", // Added HugeIcons fonts
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_BASE || ''} https://o4509957715460096.ingest.de.sentry.io https://api.spotify.com https://accounts.spotify.com https://sdk.scdn.co https://auth.privy.io https://explorer-api.walletconnect.com https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://rpc.helius.xyz wss://api.mainnet-beta.solana.com wss://api.devnet.solana.com`,
      "frame-ancestors 'self'",
      "frame-src 'self' https://open.spotify.com https://sdk.scdn.co https://auth.privy.io",
      "media-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), microphone=()' },
];

const nextConfig: NextConfig = {
  // Avoid failing production builds on lint-only errors (e.g., stale cache on CI)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/embed/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
        pathname: '/image/**',
      },
    ],
  },
  // Ensure monorepo/workspace root is detected correctly during builds (e.g., Docker/Railway)
  // to avoid Next.js scanning the wrong directory when multiple lockfiles exist.
  outputFileTracingRoot: path.join(__dirname, ".."),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry configuration options - DISABLED FOR NOW
// const sentryWebpackPluginOptions = {
//   org: "epic-loot-labs",
//   project: "volume-dashboard",
//   silent: !process.env.CI,
//   widenClientFileUpload: true,
//   tunnelRoute: "/monitoring",
//   hideSourceMaps: true,
//   disableLogger: true,
//   automaticVercelMonitors: true,
// };

// export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
export default nextConfig;
