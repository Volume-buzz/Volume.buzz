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

  // Fetch minimal data for Overview with error handling for rate limits
  const [me, activeRaids, walletResult] = await Promise.all([
    apiGet<MeResponse>("/api/users/me").catch(() => null),
    apiGet<ActiveRaid[]>("/api/raids/active").catch(() => []),
    apiGet<{ public_key: string; balances: { sol: number } }>("/api/wallet/me").catch(() => null),
  ]);

  const wallet = walletResult;
  interface MineItem { id: number; qualified: boolean }
  interface RecentReward { id: string; amount: string; token: { symbol: string }; created_at: string }
  const [mine, rewards] = await Promise.all([
    apiGet<MineItem[]>("/api/raids/mine/list").catch(() => []),
    apiGet<RecentReward[]>("/api/rewards/mine").catch(() => []),
  ]);
  const qualifiedCount = mine.filter((p) => p.qualified).length;

  return (
    <div className="w-full max-w-full overflow-hidden">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Welcome to Volume Dashboard
        </h1>
        <p className="text-muted-foreground text-base md:text-lg">
          Hey {me?.name}! Your Discord bot dashboard.
        </p>
      </div>
            
      <div className="flex items-center space-x-3 md:space-x-4 p-3 md:p-4 bg-muted rounded-lg">
        {me?.image ? (
          <Image
            src={me.image}
            alt="Profile" 
            width={40}
            height={40}
            className="rounded-full md:w-12 md:h-12"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary flex items-center justify-center">
            <i className="hgi-stroke hgi-discord text-white text-2xl" />
          </div>
        )}
        <div className="text-left min-w-0 flex-1">
          <p className="font-medium text-foreground truncate">{me?.name}</p>
          <p className="text-xs md:text-sm text-muted-foreground truncate">Discord ID: {me?.discord_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 pt-4">
        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-wallet-03 text-primary text-xl" />
            SOL Balance
          </h3>
          <p className="text-xl md:text-2xl text-foreground">{wallet?.balances?.sol?.toFixed(4) ?? '0.0000'} SOL</p>
          <p className="text-xs text-muted-foreground mt-1">Wallet: {me?.wallet?.public_key ? me.wallet.public_key.slice(0,4)+"..."+me.wallet.public_key.slice(-4) : 'not created'}</p>
        </div>
        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-music-note-01 text-primary text-xl" />
            Active Raids
          </h3>
          <p className="text-xl md:text-2xl text-foreground">{activeRaids?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">Join from the list below</p>
        </div>
        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-checkmark-circle-01 text-primary text-xl" />
            Qualified Raids
          </h3>
          <p className="text-xl md:text-2xl text-foreground">{qualifiedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Ready to claim rewards</p>
        </div>
        <div className="bg-muted rounded-lg p-3 md:p-4">
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2 text-sm md:text-base">
            <i className="hgi-stroke hgi-spotify text-primary text-xl" />
            Spotify
          </h3>
          <p className="text-sm md:text-base text-foreground">
            {me?.spotify_is_connected 
              ? (me?.spotify_is_premium ? 'Premium connected' : 'Free account connected')
              : 'Connect for premium perks'
            }
          </p>
        </div>
      </div>

      <div className="text-left pt-4 md:pt-6">
        <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">Active Raids</h2>
        <div className="grid gap-3">
          {activeRaids?.slice(0,5).map((r) => (
            <div key={r.id} className="bg-muted rounded-lg p-3 md:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {r.track_artwork_url && (
                    <Image src={r.track_artwork_url} alt={r.track_title || 'Track'} width={40} height={40} className="rounded flex-shrink-0"/>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-sm md:text-base truncate">{r.track_title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.track_artist}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Reward</p>
                    <p className="font-medium text-foreground text-sm">{r.reward_amount} {r.token_mint}</p>
                  </div>
                  <form action={`/api/raids/${r.id}/join`} method="post">
                    <button className="px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground whitespace-nowrap">Join</button>
                  </form>
                </div>
              </div>
            </div>
          ))}
          {!activeRaids?.length && (
            <p className="text-sm text-muted-foreground">No active raids right now.</p>
          )}
        </div>
      </div>

      <div className="text-left pt-4 md:pt-6">
        <h2 className="text-lg md:text-xl font-semibold text-foreground mb-3">Recent Rewards</h2>
        <div className="grid gap-2">
          {rewards.slice(0,5).map((r) => (
            <div key={r.id} className="bg-muted rounded-lg p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-foreground font-medium">Reward</div>
                <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                  <div className="text-sm text-foreground font-semibold">{r.amount} {r.token.symbol}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              </div>
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
