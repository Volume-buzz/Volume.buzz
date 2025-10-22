/**
 * ⚠️ DEPRECATED: Spotify page is deprecated and replaced by Discord-based participation
 *
 * For historical reference, see: AUDIUS_SPOTIFY_INTEGRATION_ANALYSIS.md
 *
 * This page previously handled:
 * - Direct Spotify listening via Web Playback SDK
 * - Smart contract token claims
 * - Real-time listening verification
 *
 * Now replaced by:
 * - Discord bot for raid participation
 * - Web dashboard for raid creation & analytics
 * - Heartbeat verification via API
 *
 * Full page code commented out below for reference during migration.
 */

export default function SpotifyPage() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <h1>🎵 Spotify Support Coming Soon</h1>
      <p>Spotify integration is being redesigned for Discord bot participation</p>
      <p style={{ fontSize: '14px', color: '#666' }}>
        For now, please use the Artist Control Station to create listening parties and join via Discord
      </p>
    </div>
  );
}

/*
"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { motion } from 'framer-motion';

[Original Spotify page implementation preserved for reference during migration]
*/
