'use client';

import { useState } from 'react';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePrivy } from '@privy-io/react-auth';

interface CreateListeningPartyModalProps {
  onSuccess?: () => void;
}

export function CreateListeningPartyModal({ onSuccess }: CreateListeningPartyModalProps) {
  const { user: privyUser } = usePrivy();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    track_id: '',
    track_title: '',
    track_artist: '',
    track_artwork_url: '',
    platform: 'audius' as 'audius' | 'spotify',
    token_mint: '',
    tokens_per_participant: '1000000',
    max_participants: '10',
    duration_minutes: '30',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!privyUser?.discordId) {
        throw new Error('Discord authentication required');
      }

      if (!formData.track_id || !formData.track_title) {
        throw new Error('Track ID and title are required');
      }

      if (!formData.token_mint) {
        throw new Error('Token mint is required');
      }

      // Create listening party via API
      const response = await fetch('/api/listening-parties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          artist_discord_id: privyUser.discordId,
          track_id: formData.track_id,
          track_title: formData.track_title,
          track_artist: formData.track_artist,
          track_artwork_url: formData.track_artwork_url,
          platform: formData.platform,
          token_mint: formData.token_mint,
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
        track_id: '',
        track_title: '',
        track_artist: '',
        track_artwork_url: '',
        platform: 'audius',
        token_mint: '',
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Track Information */}
            <div className="space-y-4 pb-4 border-b border-white/10">
              <h3 className="font-semibold text-white text-sm">Track Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="platform" className="text-white/80 text-sm mb-1.5 block">
                    Platform
                  </Label>
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
                  <Label htmlFor="track_id" className="text-white/80 text-sm mb-1.5 block">
                    Track ID
                  </Label>
                  <Input
                    id="track_id"
                    name="track_id"
                    value={formData.track_id}
                    onChange={handleInputChange}
                    placeholder="e.g., audius_track_123"
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="track_title" className="text-white/80 text-sm mb-1.5 block">
                  Track Title
                </Label>
                <Input
                  id="track_title"
                  name="track_title"
                  value={formData.track_title}
                  onChange={handleInputChange}
                  placeholder="Song Name"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="track_artist" className="text-white/80 text-sm mb-1.5 block">
                    Artist Name
                  </Label>
                  <Input
                    id="track_artist"
                    name="track_artist"
                    value={formData.track_artist}
                    onChange={handleInputChange}
                    placeholder="Artist Name"
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="track_artwork_url" className="text-white/80 text-sm mb-1.5 block">
                    Artwork URL
                  </Label>
                  <Input
                    id="track_artwork_url"
                    name="track_artwork_url"
                    value={formData.track_artwork_url}
                    onChange={handleInputChange}
                    placeholder="https://..."
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Token Rewards */}
            <div className="space-y-4 pb-4 border-b border-white/10">
              <h3 className="font-semibold text-white text-sm">Token Rewards</h3>

              <div>
                <Label htmlFor="token_mint" className="text-white/80 text-sm mb-1.5 block">
                  Token Mint Address
                </Label>
                <Input
                  id="token_mint"
                  name="token_mint"
                  value={formData.token_mint}
                  onChange={handleInputChange}
                  placeholder="Token mint (SOL or custom SPL token)"
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/40 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tokens_per_participant" className="text-white/80 text-sm mb-1.5 block">
                    Tokens Per Participant
                  </Label>
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
                  <Label htmlFor="max_participants" className="text-white/80 text-sm mb-1.5 block">
                    Max Participants (1-10)
                  </Label>
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
                <Label htmlFor="duration_minutes" className="text-white/80 text-sm mb-1.5 block">
                  Duration (minutes)
                </Label>
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
            onClick={handleSubmit}
            disabled={loading}
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
