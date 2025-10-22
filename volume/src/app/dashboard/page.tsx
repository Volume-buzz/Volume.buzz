'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { CreateListeningPartyModal } from '@/components/listening-parties/CreateListeningPartyModal';
import { ListeningPartyAnalytics } from '@/components/listening-parties/ListeningPartyAnalytics';
import { usePrivy } from '@privy-io/react-auth';

interface ListeningParty {
  id: string;
  track: {
    id: string;
    title: string;
    artist: string;
    artwork: string;
  };
  platform: string;
  status: string;
  reward: {
    token_mint: string;
    tokens_per_participant: string;
  };
  capacity: {
    max: number;
    claimed: number;
    participants: number;
    qualified: number;
  };
  timing: {
    created_at: string;
    expires_at: string;
    duration_minutes: number;
  };
}

export default function DashboardPage() {
  const { user: privyUser } = usePrivy();
  const [parties, setParties] = useState<ListeningParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParties = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/listening-parties/artist/my-parties', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch parties');
      }

      const data = await response.json();
      setParties(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (privyUser?.discordId) {
      fetchParties();
    }
  }, [privyUser?.discordId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'COMPLETED':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'CANCELLED':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();
  const timeRemaining = (expiresAt: string) => {
    const ms = new Date(expiresAt).getTime() - new Date().getTime();
    if (ms <= 0) return 'Expired';
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'Less than 1 min';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Artist Control Station</h1>
          <p className="text-muted-foreground text-sm md:text-base mt-1">
            Create and manage your listening parties to reward your audience
          </p>
        </div>
        <CreateListeningPartyModal onSuccess={fetchParties} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-target text-primary text-lg" />
            Total Parties
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-foreground">{parties.length}</p>
        </div>

        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-trending-up text-primary text-lg" />
            Active Now
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-foreground">
            {parties.filter(p => p.status === 'ACTIVE' && !isExpired(p.timing.expires_at)).length}
          </p>
        </div>

        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-users text-primary text-lg" />
            Total Participants
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-foreground">
            {parties.reduce((sum, p) => sum + (p.capacity?.participants || 0), 0)}
          </p>
        </div>

        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-checkmark-circle-01 text-primary text-lg" />
            Qualified Users
          </h3>
          <p className="text-2xl md:text-3xl font-bold text-foreground">
            {parties.reduce((sum, p) => sum + (p.capacity?.qualified || 0), 0)}
          </p>
        </div>
      </div>

      {/* Parties List */}
      <div>
        <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">Your Listening Parties</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <i className="hgi-stroke hgi-loader-01 text-primary text-3xl animate-spin block mb-2" />
              <p className="text-muted-foreground">Loading parties...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <p className="text-red-400">Error: {error}</p>
          </div>
        ) : parties.length === 0 ? (
          <div className="text-center py-12 bg-muted rounded-lg">
            <i className="hgi-stroke hgi-music-note-02 text-muted-foreground text-4xl block mb-3" />
            <p className="text-foreground font-medium mb-1">No listening parties yet</p>
            <p className="text-muted-foreground text-sm mb-4">Create your first party to get started</p>
            <CreateListeningPartyModal onSuccess={fetchParties} />
          </div>
        ) : (
          <div className="space-y-3">
            {parties.map((party) => {
              const expired = isExpired(party.timing.expires_at);
              const remaining = timeRemaining(party.timing.expires_at);

              return (
                <div
                  key={party.id}
                  className="bg-muted rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Track Info */}
                    <div className="flex items-start gap-3 flex-1">
                      {party.track?.artwork && (
                        <Image
                          src={party.track.artwork}
                          alt={party.track.title}
                          width={60}
                          height={60}
                          className="rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{party.track?.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{party.track?.artist}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                              party.status
                            )}`}
                          >
                            {party.status}
                          </span>
                          <span className="text-xs text-muted-foreground">{party.platform}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Reward</p>
                        <p className="text-sm font-semibold text-foreground">
                          {parseInt(party.reward.tokens_per_participant).toLocaleString()}
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Capacity</p>
                        <p className="text-sm font-semibold text-foreground">
                          {party.capacity?.claimed}/{party.capacity?.max}
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Qualified</p>
                        <p className="text-sm font-semibold text-green-400">{party.capacity?.qualified || 0}</p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Time Left</p>
                        <p className={`text-sm font-semibold ${expired ? 'text-red-400' : 'text-foreground'}`}>
                          {remaining}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Next Steps */}
      {parties.length === 0 && !loading && (
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 mt-6">
          <p className="text-blue-300 text-sm">
            <span className="font-semibold">Next Steps:</span> Create a listening party above, then Discord users can join via your server's bot commands to listen and earn rewards.
          </p>
        </div>
      )}

      {/* Analytics Section */}
      {parties.length > 0 && (
        <div className="border-t border-white/10 pt-6">
          <ListeningPartyAnalytics />
        </div>
      )}
    </div>
  );
}
