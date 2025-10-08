import { Sidebar, SidebarBody, SidebarSpacer } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api-client";
import Image from "next/image";
import { RaidProvider } from "@/contexts/RaidContext";

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

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-transparent">
      <Sidebar>
        <SidebarBody className="justify-between gap-4 md:gap-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <AppSidebar userRole={userRole} />
          </div>
          <div className="px-2 md:px-4 pb-2 md:pb-4">
            <div className="flex items-center justify-between gap-1 md:gap-2 text-xs md:text-sm">
              <div className="flex items-center gap-1 md:gap-2 min-w-0">
                {session.image ? (
                  <Image
                    src={session.image}
                    alt="Avatar"
                    width={24}
                    height={24}
                    className="rounded-full flex-shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-primary-foreground">
                      {session.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-sidebar-foreground truncate">
                  {session.name}
                </span>
              </div>
            </div>
          </div>
        </SidebarBody>
        <SidebarSpacer />
      </Sidebar>
      <main className="flex-1 w-full md:border-l border-border overflow-hidden">
        <RaidProvider>
          <div className="w-full h-full [&:has([data-spotify-page])]:p-0 p-4 pb-16 md:p-6 space-y-4 md:space-y-6 [&:has([data-spotify-page])]:space-y-0 overflow-y-auto [&:has([data-spotify-page])]:overflow-hidden">
            {children}
          </div>
        </RaidProvider>
      </main>
    </div>
  );
}