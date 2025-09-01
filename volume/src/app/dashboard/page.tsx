import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Image from "next/image";
import { apiGet } from "@/lib/api-client";

interface MeResponse {
  discord_id: string;
  role: string;
  spotify_is_premium: boolean;
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
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch minimal data for Overview
  const [me, activeRaids] = await Promise.all([
    apiGet<MeResponse>("/api/users/me"),
    apiGet<ActiveRaid[]>("/api/raids/active"),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-lg border p-8 text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">
                Welcome to Volume Dashboard
              </h1>
              <p className="text-muted-foreground text-lg">
                Hey {session.name}! Your Discord bot dashboard is coming soon.
              </p>
            </div>
            
            <div className="flex items-center justify-center space-x-4 p-4 bg-muted rounded-lg">
              <Image 
                src={session.image || "/default-avatar.png"} 
                alt="Profile" 
                width={48}
                height={48}
                className="w-12 h-12 rounded-full"
              />
              <div className="text-left">
                <p className="font-medium text-foreground">{session.name}</p>
                <p className="text-sm text-muted-foreground">{session.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">💰 Current Balance</h3>
                <p className="text-2xl text-foreground">{me?.balances?.tokens_balance ?? 0} VOL</p>
                <p className="text-xs text-muted-foreground mt-1">Wallet: {me?.wallet?.public_key ? me.wallet.public_key.slice(0,6)+"..."+me.wallet.public_key.slice(-4) : 'not created'}</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">🎵 Active Raids</h3>
                <p className="text-2xl text-foreground">{activeRaids?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Join from the list below</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">🛡️ Spotify</h3>
                <p className="text-foreground">{me?.spotify_is_premium ? 'Premium connected' : 'Connect for premium perks'}</p>
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
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Reward</p>
                      <p className="font-medium text-foreground">{r.reward_amount} {r.token_mint}</p>
                    </div>
                  </div>
                ))}
                {!activeRaids?.length && (
                  <p className="text-sm text-muted-foreground">No active raids right now.</p>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-8">
              Dashboard features coming soon. Return to Discord to use bot commands.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
