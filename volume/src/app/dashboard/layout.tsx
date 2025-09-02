import { Sidebar, SidebarBody } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api-client";
import { ThemeToggle } from "@/components/theme-toggle";
import Image from "next/image";

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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <AppSidebar userRole={userRole} />
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                {session.image && (
                  <Image
                    src={session.image}
                    alt="Avatar"
                    width={28}
                    height={28}
                    className="rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className="text-sidebar-foreground">
                  {session.name}
                </span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </SidebarBody>
      </Sidebar>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-background border-l border-border overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}