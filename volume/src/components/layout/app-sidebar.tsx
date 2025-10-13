"use client";

import Link from "next/link";
import { SidebarLink } from "@/components/ui/sidebar";

interface AppSidebarProps {
  userRole?: string;
}

export function AppSidebar({ userRole }: AppSidebarProps) {
  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ARTIST";

  const links = [
    {
      label: "Overview",
      href: "/dashboard",
      icon: <i className="hgi-stroke hgi-dashboard-speed-01 text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Raids",
      href: "/dashboard/raids",
      icon: <i className="hgi-stroke hgi-music-note-01 text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "History",
      href: "/dashboard/history",
      icon: <i className="hgi-stroke hgi-time-half-pass text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Wallet",
      href: "/dashboard/wallet",
      icon: <i className="hgi-stroke hgi-wallet-03 text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Spotify",
      href: "/dashboard/spotify",
      icon: <i className="hgi-stroke hgi-spotify text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Audius",
      href: "/dashboard/audius",
      icon: <i className="fas fa-headphones text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
  ];

  const adminLinks = [
    {
      label: "Admin",
      href: "/dashboard/admin",
      icon: <i className="hgi-stroke hgi-security-block text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Create Raid",
      href: "/dashboard/admin/raids/create",
      icon: <i className="hgi-stroke hgi-add-01 text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Manage Tokens",
      href: "/dashboard/admin/tokens",
      icon: <i className="hgi-stroke hgi-bitcoin-01 text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
    {
      label: "Manage Users",
      href: "/dashboard/admin/users",
      icon: <i className="hgi-stroke hgi-user-multiple text-neutral-700 dark:text-neutral-200 text-xl" />,
    },
  ];

  const settingsLink = {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <i className="hgi-stroke hgi-settings-02 text-neutral-700 dark:text-neutral-200 text-xl" />,
  };

  const allLinks = [
    ...links,
    ...(isAdmin ? adminLinks : []),
    settingsLink,
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header/Logo */}
      <div className="px-1 mb-6">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2">
          <img
            src="/volume-logo.png"
            alt="Volume Logo"
            className="w-8 h-8 rounded-lg shrink-0 object-contain"
          />
          <div className="overflow-hidden">
            <div className="font-semibold text-sidebar-foreground text-lg truncate">Volume</div>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col px-1 space-y-6">
        <div className="space-y-3">
          {links.map((link, idx) => (
            <SidebarLink key={idx} link={link} />
          ))}
        </div>

        {/* Admin Links */}
        {isAdmin && (
          <div className="space-y-3">
            {adminLinks.map((link, idx) => (
              <SidebarLink key={`admin-${idx}`} link={link} />
            ))}
          </div>
        )}

        {/* Spacer to push settings to bottom */}
        <div className="flex-1" />

        {/* Settings at bottom */}
        <div className="space-y-3">
          <SidebarLink link={settingsLink} />
        </div>
      </nav>
    </div>
  );
}