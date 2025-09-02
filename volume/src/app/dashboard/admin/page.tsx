import { apiGet } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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

export default async function AdminPage() {
  const me = await apiGet<MeResponse>("/api/users/me");

  // Check if user has admin access
  const isAdmin = me.role === "SUPER_ADMIN" || me.role === "ARTIST";

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">You don&apos;t have permission to access admin features.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage raids, tokens, and users</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Create Raid Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-music text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Create Raid</h3>
              <p className="text-sm text-muted-foreground">
                Set up new music listening raids with rewards
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/dashboard/admin/raids/create">Create New Raid</Link>
            </Button>
          </div>
        </div>

        {/* Manage Tokens Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-coins text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Manage Tokens</h3>
              <p className="text-sm text-muted-foreground">
                Configure reward tokens and their properties
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/admin/tokens">Manage Tokens</Link>
            </Button>
          </div>
        </div>

        {/* Manage Users Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-users text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Manage Users</h3>
              <p className="text-sm text-muted-foreground">
                View and manage user roles and permissions
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/admin/users">Manage Users</Link>
            </Button>
          </div>
        </div>

        {/* Analytics Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-chart-bar text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Analytics</h3>
              <p className="text-sm text-muted-foreground">
                View platform statistics and raid performance
              </p>
            </div>
            <Button asChild variant="outline" className="w-full" disabled>
              <span>Coming Soon</span>
            </Button>
          </div>
        </div>

        {/* Webhook Monitor Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-link text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Webhook Monitor</h3>
              <p className="text-sm text-muted-foreground">
                Monitor webhook events and system status
              </p>
            </div>
            <Button asChild variant="outline" className="w-full" disabled>
              <span>Coming Soon</span>
            </Button>
          </div>
        </div>

        {/* Settings Card */}
        <div className="bg-card border rounded-lg p-6">
          <div className="space-y-4">
            <div className="text-3xl">
              <i className="fas fa-cog text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">System Settings</h3>
              <p className="text-sm text-muted-foreground">
                Configure platform-wide settings and parameters
              </p>
            </div>
            <Button asChild variant="outline" className="w-full" disabled>
              <span>Coming Soon</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Admin Role:</strong> {me.role} | 
          <strong> Access Level:</strong> {me.role === "SUPER_ADMIN" ? "Full Access" : "Artist Access"}
        </p>
      </div>
    </div>
  );
}