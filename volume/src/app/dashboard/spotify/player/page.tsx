"use client";
import Script from 'next/script';
import { useEffect, useState } from 'react';

type OAuthTokenCallback = (token: string) => void;
interface SpotifyPlayer {
  addListener: (event: string, cb: (payload: unknown) => void) => void;
  connect: () => Promise<boolean>;
}
interface SpotifyGlobal {
  Player: new (opts: { name: string; getOAuthToken: (cb: OAuthTokenCallback) => void; volume?: number }) => SpotifyPlayer;
}

declare global {
  interface Window {
    Spotify?: SpotifyGlobal;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export default function SpotifyPlayerPage() {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      setReady(true);
    };
  }, []);

  useEffect(() => {
    if (!ready || !window.Spotify) return;
    (async () => {
      try {
        const player = new window.Spotify!.Player({
          name: 'Volume Web Player',
          getOAuthToken: async (cb: OAuthTokenCallback) => {
            const res = await fetch('/api/player/token');
            const json = await res.json();
            if (!res.ok || !json.access_token) throw new Error('token');
            cb(json.access_token as string);
          },
          volume: 0.8,
        });

        player.addListener('ready', (payload: unknown) => {
          const p = payload as { device_id?: string };
          if (p.device_id) setDeviceId(p.device_id);
        });
        player.addListener('not_ready', () => {
          setDeviceId(null);
        });
        player.addListener('initialization_error', (payload: unknown) => setError((payload as { message?: string }).message || 'init error'));
        player.addListener('authentication_error', (payload: unknown) => setError((payload as { message?: string }).message || 'auth error'));
        player.addListener('account_error', (payload: unknown) => setError((payload as { message?: string }).message || 'account error'));

        await player.connect();
      } catch {
        setError('Failed to initialize player');
      }
    })();
  }, [ready]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Script src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" />
      <h1 className="text-2xl font-semibold mb-4 text-foreground">Embedded Player</h1>
      {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
      <div className="text-sm text-foreground">SDK: {ready ? 'Loaded' : 'Loading…'}</div>
      <div className="text-sm text-foreground">Device: {deviceId || 'Not ready'}</div>
      <p className="text-xs text-muted-foreground mt-2">Start playback via the Spotify page controls or API when device is ready.</p>
    </div>
  );
}
