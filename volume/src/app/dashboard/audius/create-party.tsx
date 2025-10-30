'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Server {
  server_id: string;
  server_name: string;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

export function CreateListeningParty() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [trackUrl, setTrackUrl] = useState('');
  const [tokenMint, setTokenMint] = useState('');
  const [tokensPerParticipant, setTokensPerParticipant] = useState('100');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedServer, setSelectedServer] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');

  // Data
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [trackInfo, setTrackInfo] = useState<any>(null);

  // Fetch artist's servers
  useEffect(() => {
    fetchServers();
  }, []);

  // Fetch channels when server selected
  useEffect(() => {
    if (!selectedServer) {
      setChannels([]);
      setSelectedChannel('');
      return;
    }

    if (!servers.find((s) => s.server_id === selectedServer)) {
      setChannels([]);
      setSelectedChannel('');
      setError('Selected server is unavailable. Refresh and try again.');
      return;
    }

    fetchChannels(selectedServer);
  }, [selectedServer, servers]);

  const fetchServers = async () => {
    try {
      const res = await fetch(`/api/discord/servers`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || 'Failed to fetch servers');
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : data.servers || [];
      // Map the Discord API response to expected format
      const mappedServers = list.map((s: any) => ({
        server_id: s.id,
        server_name: s.name,
      }));
      setServers(mappedServers);
      setError(mappedServers.length === 0 ? 'No Discord servers found where you are an admin. Verify your Discord login and permissions.' : '');
    } catch (err: any) {
      console.error('Error fetching servers:', err);
      setError(
        err?.message ||
          'Failed to load your Discord servers. Confirm you are logged in and have sufficient permissions.'
      );
    }
  };

  const fetchChannels = async (serverId: string) => {
    try {
      const res = await fetch(`/api/discord/servers/${serverId}/channels`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || 'Failed to fetch channels');
      }

      const data = await res.json();
      // Filter for text (0) and announcement (5) channels
      const textChannels = (data.channels || []).filter((ch: Channel) => ch.type === 0 || ch.type === 5);
      console.log('Fetched Discord channels:', textChannels);
      setChannels(textChannels);
      if (textChannels.length === 0) {
        setError('No text or announcement channels found where the bot can post. Update channel permissions and try again.');
      } else {
        setError('');
      }
    } catch (err: any) {
      console.error('Error fetching channels:', err);
      setChannels([]);
      setError(err?.message || 'Failed to load server channels');
    }
  };

  const extractTrackIdFromUrl = (url: string): string | null => {
    try {
      // Match: https://audius.co/artist/track-name or https://audius.co/embed/track/ID
      const permalinkMatch = url.match(/audius\.co\/([^\/]+)\/([^\/\?]+)/);
      if (permalinkMatch) {
        return `/${permalinkMatch[1]}/${permalinkMatch[2]}`;
      }

      const embedMatch = url.match(/audius\.co\/embed\/track\/([^\/\?]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  };

  const resolveTrack = async (url: string) => {
    setLoading(true);
    setError('');
    setTrackInfo(null);

    try {
      const trackId = extractTrackIdFromUrl(url);
      if (!trackId) {
        throw new Error('Invalid Audius URL');
      }

      const apiKey = process.env.NEXT_PUBLIC_AUDIUS_API_KEY;
      let apiUrl = '';

      if (trackId.startsWith('/')) {
        // Permalink - use resolve
        apiUrl = `https://api.audius.co/v1/resolve?url=https://audius.co${trackId}&app_name=VOLUME`;
      } else {
        // Direct ID
        apiUrl = `https://api.audius.co/v1/tracks/${trackId}?app_name=VOLUME`;
      }

      const res = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'X-API-Key': apiKey || '',
        },
      });

      if (!res.ok) {
        throw new Error('Track not found');
      }

      const data = await res.json();
      const track = data.data;

      setTrackInfo({
        id: track.id,
        title: track.title,
        artist: track.user.name,
        artwork: track.artwork?.['480x480'] || track.artwork?.['150x150'],
      });

    } catch (err: any) {
      setError(err.message || 'Failed to resolve track');
    } finally {
      setLoading(false);
    }
  };

  const createParty = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!trackInfo) {
        throw new Error('Please resolve a track first');
      }

      if (!tokenMint) {
        throw new Error('Please enter token mint address');
      }

      if (!selectedServer || !selectedChannel) {
        throw new Error('Please select a Discord server and channel');
      }

      const res = await fetch(`/api/listening-parties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          track_id: trackInfo.id,
          track_title: trackInfo.title,
          track_artist: trackInfo.artist,
          track_artwork_url: trackInfo.artwork,
          platform: 'audius',
          token_mint: tokenMint,
          tokens_per_participant: tokensPerParticipant,
          max_participants: maxParticipants,
          duration_minutes: durationMinutes,
          server_id: selectedServer,
          channel_id: selectedChannel,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create party');
      }

      const data = await res.json();
      setSuccess(`Listening party created! ID: ${data.id}`);

      // Reset form
      setTrackUrl('');
      setTrackInfo(null);
      setTokensPerParticipant('100');
      setMaxParticipants(10);
      setDurationMinutes(60);

    } catch (err: any) {
      setError(err.message || 'Failed to create listening party');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create Listening Party</h1>

      {/* Track Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Audius Track URL</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            placeholder="https://audius.co/artist/track-name"
            className="flex-1 px-4 py-2 border rounded-lg"
          />
          <button
            onClick={() => resolveTrack(trackUrl)}
            disabled={loading || !trackUrl}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50"
          >
            Resolve
          </button>
        </div>
      </div>

      {/* Track Info */}
      {trackInfo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 p-4 bg-gray-100 rounded-lg flex items-center gap-4"
        >
          {trackInfo.artwork && (
            <img src={trackInfo.artwork} alt="" className="w-16 h-16 rounded" />
          )}
          <div>
            <div className="font-bold">{trackInfo.title}</div>
            <div className="text-sm text-gray-600">{trackInfo.artist}</div>
          </div>
        </motion.div>
      )}

      {/* Token Config */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Token Mint Address</label>
          <input
            type="text"
            value={tokenMint}
            onChange={(e) => setTokenMint(e.target.value)}
            placeholder="Token mint address"
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Tokens per Participant</label>
          <input
            type="number"
            value={tokensPerParticipant}
            onChange={(e) => setTokensPerParticipant(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Party Config */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Max Participants</label>
          <input
            type="number"
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
            min={1}
            max={100}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
            min={1}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Server/Channel Selector */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Discord Server</label>
          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="">Select server...</option>
            {servers.map((server) => (
              <option key={server.server_id} value={server.server_id}>
                {server.server_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Channel</label>
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="">Select channel...</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
          {selectedServer && channels.length === 0 && (
            <p className="mt-2 text-xs text-gray-600">
              No eligible text or announcement channels found. Check the bot&apos;s permissions in this server.
            </p>
          )}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Create Button */}
      <button
        onClick={createParty}
        disabled={loading || !trackInfo || !selectedServer || !selectedChannel}
        className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Listening Party'}
      </button>
    </div>
  );
}
