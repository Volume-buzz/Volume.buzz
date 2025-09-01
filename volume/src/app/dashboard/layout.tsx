import { cookies } from "next/headers";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Get user info for sidebar (role-based navigation)
  let userRole = "FAN";
  try {
    const me = await apiGet<MeResponse>("/api/users/me");
    userRole = me.role;
  } catch (error) {
    console.error("Failed to fetch user role:", error);
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar userRole={userRole} />
      <main className="flex flex-1 flex-col transition-all duration-300 ease-in-out">
        <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Welcome back, {session.name}</span>
          </div>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}