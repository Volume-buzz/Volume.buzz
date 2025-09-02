import { Sidebar, SidebarBody } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
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
  let userInfo = null;
  try {
    const me = await apiGet<MeResponse>("/api/users/me");
    userRole = me.role;
    userInfo = me;
  } catch (error) {
    console.error("Failed to fetch user role:", error);
  }

  return (
    <div className="flex flex-col md:flex-row bg-gray-100 dark:bg-neutral-800 w-full flex-1 max-w-7xl mx-auto border border-neutral-200 dark:border-neutral-700 overflow-hidden h-screen">
      <Sidebar>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <AppSidebar userRole={userRole} />
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 text-sm">
              {session.image && (
                <img
                  src={session.image}
                  alt="Avatar"
                  className="h-7 w-7 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="text-neutral-700 dark:text-neutral-200">
                {session.name}
              </span>
            </div>
          </div>
        </SidebarBody>
      </Sidebar>
      <div className="flex flex-1 overflow-hidden">
        <div className="p-2 md:p-10 rounded-tl-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex flex-col gap-2 flex-1 w-full h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}