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
      icon: <i className="fas fa-tachometer-alt text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Raids",
      href: "/dashboard/raids",
      icon: <i className="fas fa-music text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "History",
      href: "/dashboard/history", 
      icon: <i className="fas fa-history text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Wallet",
      href: "/dashboard/wallet",
      icon: <i className="fas fa-wallet text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Spotify",
      href: "/dashboard/spotify",
      icon: <i className="fab fa-spotify text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
  ];

  const adminLinks = [
    {
      label: "Admin",
      href: "/dashboard/admin",
      icon: <i className="fas fa-shield-alt text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Create Raid",
      href: "/dashboard/admin/raids/create",
      icon: <i className="fas fa-plus text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Manage Tokens",
      href: "/dashboard/admin/tokens", 
      icon: <i className="fas fa-coins text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
    {
      label: "Manage Users",
      href: "/dashboard/admin/users",
      icon: <i className="fas fa-users text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
    },
  ];

  const settingsLink = {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <i className="fas fa-cog text-neutral-700 dark:text-neutral-200 h-5 w-5" />,
  };

  const allLinks = [
    ...links,
    ...(isAdmin ? adminLinks : []),
    settingsLink,
  ];

  return (
    <div className="py-4">
      <div className="px-4 mb-8">
        <Link href="/dashboard" className="flex items-center gap-2">
          <i className="fas fa-music text-2xl text-primary" />
          <div>
            <div className="font-semibold text-neutral-800 dark:text-neutral-200">Volume</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400">Dashboard</div>
          </div>
        </Link>
      </div>
      
      <div className="flex flex-col gap-2">
        {allLinks.map((link, idx) => (
          <SidebarLink key={idx} link={link} />
        ))}
      </div>
    </div>
  );
}