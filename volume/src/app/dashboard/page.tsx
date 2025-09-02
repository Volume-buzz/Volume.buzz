import Image from "next/image";
import { apiGet } from "@/lib/api-client";

interface MeResponse {
  discord_id: string;
  role: string;
  spotify_is_premium: boolean;
  spotify_is_connected: boolean;
  name?: string | null;
  image?: string | null;
  balances: { tokens_balance: number };
  wallet: null | { public_key: string; exported_at: string | null };
}

interface ActiveRaid {
  id: number;
  track_title?: string | null;
  track_artist?: string | null;
  track_artwork_url?: string | null;
  reward_amount: number;
  token_mint?: string | null;
}

export default async function DashboardPage() {

  // Fetch minimal data for Overview
  const [me, activeRaids, wallet] = await Promise.all([
    apiGet<MeResponse>("/api/users/me"),
    apiGet<ActiveRaid[]>("/api/raids/active"),
    apiGet<{ public_key: string; balances: { sol: number } }>("/api/wallet/me"),
  ]);
  interface MineItem { id: number; qualified: boolean }
  interface RecentReward { id: string; amount: string; token: { symbol: string }; created_at: string }
  const [mine, rewards] = await Promise.all([
    apiGet<MineItem[]>("/api/raids/mine/list"),
    apiGet<RecentReward[]>("/api/rewards/mine"),
  ]);
  const qualifiedCount = mine.filter((p) => p.qualified).length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Welcome to Volume Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Hey {me?.name}! Your Discord bot dashboard.
        </p>
      </div>
            
      <div className="flex items-center justify-center space-x-4 p-4 bg-muted rounded-lg">
        {me?.image ? (
          <img
            src={me.image}
            alt="Profile" 
            className="w-12 h-12 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
            <i className="fab fa-discord text-white text-xl" />
          </div>
        )}
        <div className="text-left">
          <p className="font-medium text-foreground">{me?.name}</p>
          <p className="text-sm text-muted-foreground">Discord ID: {me?.discord_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="bg-muted rounded-lg p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <i className="fas fa-wallet text-primary" />
            SOL Balance
          </h3>
          <p className="text-2xl text-foreground">{wallet?.balances?.sol?.toFixed(4) ?? '0.0000'} SOL</p>
          <p className="text-xs text-muted-foreground mt-1">Wallet: {me?.wallet?.public_key ? me.wallet.public_key.slice(0,6)+"..."+me.wallet.public_key.slice(-4) : 'not created'}</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <i className="fas fa-music text-primary" />
            Active Raids
          </h3>
          <p className="text-2xl text-foreground">{activeRaids?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Join from the list below</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <i className="fas fa-check-circle text-primary" />
            Qualified Raids
          </h3>
          <p className="text-2xl text-foreground">{qualifiedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Ready to claim rewards</p>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <i className="fab fa-spotify text-primary" />
            Spotify
          </h3>
          <p className="text-foreground">
            {me?.spotify_is_connected 
              ? (me?.spotify_is_premium ? 'Premium connected' : 'Free account connected')
              : 'Connect for premium perks'
            }
          </p>
        </div>
      </div>

      <div className="text-left pt-6">
        <h2 className="text-xl font-semibold text-foreground mb-3">Active Raids</h2>
        <div className="grid gap-3">
          {activeRaids?.slice(0,5).map((r) => (
            <div key={r.id} className="bg-muted rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {r.track_artwork_url && (
                  <Image src={r.track_artwork_url} alt={r.track_title || 'Track'} width={40} height={40} className="rounded"/>
                )}
                <div>
                  <p className="font-medium text-foreground">{r.track_title}</p>
                  <p className="text-xs text-muted-foreground">{r.track_artist}</p>
                </div>
              </div>
              <div className="text-right flex items-center gap-4">
                <p className="text-xs text-muted-foreground">Reward</p>
                <p className="font-medium text-foreground">{r.reward_amount} {r.token_mint}</p>
                <form action={`/api/raids/${r.id}/join`} method="post">
                  <button className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground">Join</button>
                </form>
              </div>
            </div>
          ))}
          {!activeRaids?.length && (
            <p className="text-sm text-muted-foreground">No active raids right now.</p>
          )}
        </div>
      </div>

      <div className="text-left pt-6">
        <h2 className="text-xl font-semibold text-foreground mb-3">Recent Rewards</h2>
        <div className="grid gap-2">
          {rewards.slice(0,5).map((r) => (
            <div key={r.id} className="bg-muted rounded-lg p-3 flex items-center justify-between">
              <div className="text-sm text-foreground">Reward</div>
              <div className="text-sm text-foreground">{r.amount} {r.token.symbol}</div>
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            </div>
          ))}
          {!rewards.length && (
            <p className="text-sm text-muted-foreground">No rewards yet.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Dashboard features ready. Use the sidebar to navigate between pages.
      </p>
    </div>
  );
}
