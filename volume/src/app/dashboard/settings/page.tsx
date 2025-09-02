import { apiGet } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

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

export default async function SettingsPage() {
  const me = await apiGet<MeResponse>("/api/users/me");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="grid gap-6">
        {/* Theme Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Appearance</h2>
          <div className="space-y-4">
            <ThemeToggle />
          </div>
        </div>

        {/* Profile Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {me?.image ? (
                <Image
                  src={me.image}
                  alt="Profile"
                  width={64}
                  height={64}
                  className="rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                  <i className="fab fa-discord text-white text-2xl" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">{me?.name}</p>
                <p className="text-sm text-muted-foreground">Discord ID: {me?.discord_id}</p>
                <p className="text-sm text-muted-foreground">Role: {me?.role}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Spotify Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Spotify Integration</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Spotify Status</p>
                <p className="text-sm text-muted-foreground">
                  {me?.spotify_is_connected
                    ? (me?.spotify_is_premium 
                        ? "Premium account connected - enjoy enhanced features!" 
                        : "Free account connected - upgrade to Premium for enhanced features!"
                      )
                    : "Connect your Spotify account to participate in raids"
                  }
                </p>
              </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                me?.spotify_is_connected
                  ? (me?.spotify_is_premium 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    )
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
              }`}>
                {me?.spotify_is_connected 
                  ? (me?.spotify_is_premium ? 'Premium Connected' : 'Free Connected') 
                  : 'Not Connected'
                }
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/spotify">Manage Spotify</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Wallet Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Wallet</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Solana Wallet</p>
                <p className="text-sm text-muted-foreground">
                  {me?.wallet?.public_key 
                    ? `${me.wallet.public_key.slice(0, 8)}...${me.wallet.public_key.slice(-8)}`
                    : "Wallet will be created automatically when needed"
                  }
                </p>
              </div>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                me?.wallet?.public_key
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
              }`}>
                {me?.wallet?.public_key ? 'Active' : 'Not Created'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/wallet">Manage Wallet</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Security</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-foreground">Account Security</p>
              <p className="text-sm text-muted-foreground mb-3">
                Your account is secured through Discord OAuth. 
                {me?.wallet?.exported_at && " Private key export history is tracked."}
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/api/auth/logout">Sign Out</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}