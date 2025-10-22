'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface PartyMetrics {
  id: string;
  track_title: string;
  status: string;
  participants_count: number;
  qualified_count: number;
  claimed_count: number;
  listening_duration_avg: number;
  created_at: string;
  expires_at: string;
  tokens_per_participant: string;
  token_mint: string;
}

interface AnalyticsData {
  total_parties: number;
  active_parties: number;
  total_participants: number;
  total_qualified: number;
  total_claimed: number;
  total_tokens_distributed: string;
  avg_listening_duration: number;
  parties: PartyMetrics[];
}

export function ListeningPartyAnalytics() {
  const { user: privyUser } = usePrivy();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/listening-parties/artist/my-parties', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const parties = await response.json();

      // Calculate analytics from parties data
      const now = new Date();
      const activeParties = parties.filter(
        (p: any) => p.status === 'ACTIVE' && new Date(p.timing.expires_at) > now
      );

      const totalParticipants = parties.reduce((sum: number, p: any) => sum + (p.capacity?.participants || 0), 0);
      const totalQualified = parties.reduce((sum: number, p: any) => sum + (p.capacity?.qualified || 0), 0);
      const totalClaimed = parties.reduce((sum: number, p: any) => sum + (p.capacity?.claimed || 0), 0);

      const totalTokensDistributed = parties.reduce((sum: bigint, p: any) => {
        return sum + (BigInt(p.capacity?.claimed || 0) * BigInt(p.reward.tokens_per_participant));
      }, BigInt(0));

      setAnalytics({
        total_parties: parties.length,
        active_parties: activeParties.length,
        total_participants: totalParticipants,
        total_qualified: totalQualified,
        total_claimed: totalClaimed,
        total_tokens_distributed: totalTokensDistributed.toString(),
        avg_listening_duration: 0, // Would be calculated from heartbeat data
        parties: parties,
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (privyUser?.discordId) {
      fetchAnalytics();

      // Auto-refresh every 30 seconds if enabled
      if (autoRefresh) {
        const interval = setInterval(fetchAnalytics, 30000);
        return () => clearInterval(interval);
      }
    }
  }, [privyUser?.discordId, autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <i className="hgi-stroke hgi-loader-01 text-primary text-3xl animate-spin block mb-2" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const formatTokens = (tokens: string | bigint) => {
    const num = typeof tokens === 'string' ? BigInt(tokens) : tokens;
    const str = num.toString();
    if (str.length > 6) {
      return `${(Number(str) / 1e6).toFixed(2)}M`;
    }
    return (Number(str) / 1e6).toFixed(2);
  };

  const claimRate =
    analytics.total_qualified > 0
      ? ((analytics.total_claimed / analytics.total_qualified) * 100).toFixed(1)
      : '0';

  const conversionRate =
    analytics.total_participants > 0
      ? ((analytics.total_qualified / analytics.total_participants) * 100).toFixed(1)
      : '0';

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-semibold text-foreground">Analytics & Metrics</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchAnalytics}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            <i className="hgi-stroke hgi-refresh-cw text-sm" />
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Active Parties */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Active Parties</h3>
            <i className="hgi-stroke hgi-target text-blue-400 text-lg" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-blue-300">{analytics.active_parties}</p>
          <p className="text-xs text-muted-foreground mt-1">of {analytics.total_parties} total</p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Conversion Rate</h3>
            <i className="hgi-stroke hgi-trending-up text-green-400 text-lg" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-green-300">{conversionRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{analytics.total_qualified} of {analytics.total_participants}</p>
        </div>

        {/* Claim Rate */}
        <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Claim Rate</h3>
            <i className="hgi-stroke hgi-checkmark-circle-01 text-purple-400 text-lg" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-purple-300">{claimRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{analytics.total_claimed} of {analytics.total_qualified}</p>
        </div>

        {/* Tokens Distributed */}
        <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Tokens Distributed</h3>
            <i className="hgi-stroke hgi-coins-hand text-yellow-400 text-lg" />
          </div>
          <p className="text-2xl md:text-3xl font-bold text-yellow-300">
            {formatTokens(analytics.total_tokens_distributed)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total rewards paid out</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-muted rounded-lg p-4 border border-white/10">
        <h3 className="font-semibold text-foreground mb-3">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Participants</p>
            <p className="text-lg md:text-xl font-bold text-foreground">{analytics.total_participants}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Qualified Users</p>
            <p className="text-lg md:text-xl font-bold text-green-400">{analytics.total_qualified}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Claims Completed</p>
            <p className="text-lg md:text-xl font-bold text-blue-400">{analytics.total_claimed}</p>
          </div>
        </div>
      </div>

      {/* Recent Parties Performance */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Recent Party Performance</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {analytics.parties.slice(0, 5).map((party) => (
            <div key={party.id} className="bg-muted rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <p className="font-medium text-foreground text-sm truncate">{party.track_title}</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(party.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {party.claimed_count}/{party.participants_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Claimed</p>
                </div>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all"
                  style={{
                    width: `${party.participants_count > 0 ? (party.claimed_count / party.participants_count) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          {analytics.parties.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No parties yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
