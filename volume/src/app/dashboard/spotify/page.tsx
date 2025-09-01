"use client";
import { useEffect, useState } from 'react';

interface Device { id: string; name: string; type?: string }

export default function SpotifyPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [uri, setUri] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/spotify/devices');
        const json = await res.json();
        setDevices((json.devices || []) as Device[]);
      } catch {
        setErr('Failed to load devices');
      }
    })();
  }, []);

  const play = async () => {
    setErr(null);
    const res = await fetch('/api/spotify/play', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spotifyUri: uri, deviceId })
    });
    if (!res.ok) setErr('Play failed');
  };
  const pause = async () => {
    setErr(null);
    const res = await fetch('/api/spotify/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId }) });
    if (!res.ok) setErr('Pause failed');
  };
  const queue = async () => {
    setErr(null);
    const res = await fetch('/api/spotify/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spotifyUri: uri, deviceId })
    });
    if (!res.ok) setErr('Queue failed');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4 text-foreground">Spotify</h1>
      {err && <div className="mb-3 text-red-500 text-sm">{err}</div>}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Devices</h2>
          <select className="w-full px-2 py-1 rounded bg-background border" value={deviceId} onChange={(e)=>setDeviceId(e.target.value)}>
            <option value="">Select a device</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.type})</option>
            ))}
          </select>
        </div>
        <div className="border rounded-md p-4 bg-card">
          <h2 className="font-medium text-foreground mb-2">Controls</h2>
          <input className="w-full mb-2 px-2 py-1 rounded bg-background border" placeholder="spotify:track:... or https://open.spotify.com/track/..." value={uri} onChange={(e)=>setUri(e.target.value)} />
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={play}>Play</button>
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={pause}>Pause</button>
            <button className="px-3 py-2 rounded bg-primary text-primary-foreground" onClick={queue}>Queue</button>
          </div>
        </div>
      </div>
    </div>
  );
}
