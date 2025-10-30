'use client';

import { useState, useEffect } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePrivy } from '@privy-io/react-auth';

interface CreateListeningPartyModalProps {
  onSuccess?: () => void;
}

export function CreateListeningPartyModal({ onSuccess }: CreateListeningPartyModalProps) {
  const { user: privyUser } = usePrivy();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);

  const [formData, setFormData] = useState({
    server_id: '',
    channel_id: '',
    track_id: '',
    platform: 'audius' as 'audius' | 'spotify',
    tokens_per_participant: '1000000',
    max_participants: '10',
    duration_minutes: '30',
  });

  useEffect(() => {
    if (open && privyUser?.discord?.username) {
      fetchDiscordServers();
    }
  }, [open, privyUser?.discord?.username]);

  const fetchDiscordServers = async () => {
    try {
      const response = await fetch('/api/discord/servers', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const normalized = (Array.isArray(data) ? data : data?.servers ?? []).map(
          (server: any) => ({
            id: server.id,
            name: server.name,
          })
        );
        setServers(normalized);
        setError(normalized.length === 0 ? 'No Discord servers found where you have admin access. Check your Discord login and permissions.' : null);
      }
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    }
  };

  const fetchDiscordChannels = async (serverId: string) => {
    try {
      const response = await fetch(`/api/discord/servers/${serverId}/channels`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch channels');
      }

      const data = await response.json();
      const textChannels = (data.channels || [])
        .filter((channel: any) => channel.type === 0)
        .map((channel: any) => ({
          id: channel.id,
          name: channel.name,
        }));

      setChannels(textChannels);
      setError(textChannels.length === 0 ? 'No text or announcement channels available. Check channel permissions and try again.' : null);
    } catch (err) {
      console.error('Failed to load channels:', err);
      setChannels([]);
      setError(
        err instanceof Error ? err.message : 'Failed to load server channels'
      );
    }
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'server_id') {
      setFormData(prev => ({
        ...prev,
        channel_id: '',
      }));
      if (!value) {
        setChannels([]);
        return;
      }
      const server = servers.find((s) => s.id === value);
      if (!server) {
        setChannels([]);
        setError('Selected server is unavailable. Refresh the page and try again.');
        return;
      }
      await fetchDiscordChannels(value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const discordId = privyUser?.discord?.subject;
      if (!discordId) {
        throw new Error('Discord authentication required');
      }

      if (!formData.track_id) {
        throw new Error('Track ID is required');
      }

      if (!formData.server_id) {
        throw new Error('Discord server selection is required');
      }

      if (!formData.channel_id) {
        throw new Error('Discord channel selection is required');
      }

      // Create listening party via API
      const response = await fetch('/api/listening-parties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          artist_discord_id: discordId,
          server_id: formData.server_id,
          channel_id: formData.channel_id,
          track_id: formData.track_id,
          platform: formData.platform,
          tokens_per_participant: BigInt(formData.tokens_per_participant).toString(),
          max_participants: parseInt(formData.max_participants),
          duration_minutes: parseInt(formData.duration_minutes),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create listening party');
      }

      // Reset form and close
      setFormData({
        server_id: '',
        channel_id: '',
        track_id: '',
        platform: 'audius',
        tokens_per_participant: '1000000',
        max_participants: '10',
        duration_minutes: '30',
      });
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button className="bg-primary text-primary-foreground">
          <i className="hgi-stroke hgi-plus mr-2" />
          Create Listening Party
        </Button>
      </DrawerTrigger>

      <DrawerContent className="bg-white/5 backdrop-blur-2xl border-2 border-[#000000]/40 shadow-[0_20px_60px_rgba(0,0,0,0.6)] max-h-[90vh]">
        <DrawerHeader className="px-4 md:px-6">
          <DrawerTitle className="text-white text-xl md:text-2xl font-bold">Create Listening Party</DrawerTitle>
          <DrawerDescription className="text-white/60 text-sm">
            Start a new listening party and reward your audience
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto flex-1 px-4 md:px-6 py-4">
          <form id="create-listening-party-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Discord Server Selection */}
            <div className="space-y-4 pb-4 border-b border-white/10">
              <h3 className="font-semibold text-white text-sm">Discord Server</h3>
              <select
                name="server_id"
                value={formData.server_id}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="" className="bg-slate-900">Select a Discord server...</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id} className="bg-slate-900">
                    {server.name}
                  </option>
                ))}
              </select>

              {formData.server_id && (
                <div className="space-y-2">
                  <label className="text-white/80 text-sm block">Discord Channel</label>
                  <select
                    name="channel_id"
                    value={formData.channel_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    disabled={channels.length === 0}
                    required
                  >
                    <option value="" className="bg-slate-900">Select a channel...</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id} className="bg-slate-900">
                        #{channel.name}
                      </option>
                    ))}
                  </select>
                  {channels.length === 0 && (
                    <p className="text-xs text-white/60">
                      No channels available yet. Confirm the bot can view and post in at least one text or announcement channel.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Track Information */}
            <div className="space-y-4 pb-4 border-b border-white/10">
              <h3 className="font-semibold text-white text-sm">Track Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="platform" className="text-white/80 text-sm mb-1.5 block">
                    Platform
                  </label>
                  <select
                    id="platform"
                    name="platform"
                    value={formData.platform}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="audius" className="bg-slate-900">Audius</option>
                    <option value="spotify" className="bg-slate-900">Spotify</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="track_id" className="text-white/80 text-sm mb-1.5 block">
                    Track ID
                  </label>
                  <Input
                    id="track_id"
                    name="track_id"
                    value={formData.track_id}
                    onChange={handleInputChange}
                    placeholder="e.g., audius_track_123 or spotify track URI"
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Reward Settings */}
            <div className="space-y-4 pb-4 border-b border-white/10">
              <h3 className="font-semibold text-white text-sm">Reward Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tokens_per_participant" className="text-white/80 text-sm mb-1.5 block">
                    Tokens Per Participant
                  </label>
                  <Input
                    id="tokens_per_participant"
                    name="tokens_per_participant"
                    type="number"
                    value={formData.tokens_per_participant}
                    onChange={handleInputChange}
                    placeholder="1000000"
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                    required
                  />
                  <p className="text-white/50 text-xs mt-1">In smallest unit (e.g., lamports for SOL)</p>
                </div>

                <div>
                  <label htmlFor="max_participants" className="text-white/80 text-sm mb-1.5 block">
                    Max Participants (1-10)
                  </label>
                  <Input
                    id="max_participants"
                    name="max_participants"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.max_participants}
                    onChange={handleInputChange}
                    placeholder="10"
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Party Settings */}
            <div className="space-y-4 pb-4">
              <h3 className="font-semibold text-white text-sm">Party Settings</h3>

              <div>
                <label htmlFor="duration_minutes" className="text-white/80 text-sm mb-1.5 block">
                  Duration (minutes)
                </label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min="1"
                  value={formData.duration_minutes}
                  onChange={handleInputChange}
                  placeholder="30"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                  required
                />
                <p className="text-white/50 text-xs mt-1">How long the party stays active</p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Cost Estimate */}
            <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3">
              <p className="text-blue-300 text-sm">
                Total cost: {(parseInt(formData.max_participants) * parseInt(formData.tokens_per_participant)).toLocaleString()} tokens
              </p>
            </div>
          </form>
        </div>

        <DrawerFooter className="px-4 md:px-6 py-4 border-t border-white/10">
          <Button
            type="submit"
            form="create-listening-party-form"
            disabled={
              loading ||
              !formData.server_id ||
              !formData.channel_id ||
              !formData.track_id
            }
            className="w-full bg-primary text-primary-foreground font-semibold"
          >
            {loading ? (
              <>
                <i className="hgi-stroke hgi-loader-01 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <i className="hgi-stroke hgi-checkmark-circle-01 mr-2" />
                Create Party
              </>
            )}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full mt-2">
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
