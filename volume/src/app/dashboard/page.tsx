"use client";

import { useSession } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import Image from "next/image";

export default function DashboardPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

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
                Hey {session.user.name}! Your Discord bot dashboard is coming soon.
              </p>
            </div>
            
            <div className="flex items-center justify-center space-x-4 p-4 bg-muted rounded-lg">
              <Image 
                src={session.user.image || "/default-avatar.png"} 
                alt="Profile" 
                width={48}
                height={48}
                className="w-12 h-12 rounded-full"
              />
              <div className="text-left">
                <p className="font-medium text-foreground">{session.user.name}</p>
                <p className="text-sm text-muted-foreground">{session.user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">🤖 Bot Control</h3>
                <p className="text-sm text-muted-foreground">Manage your Discord bot settings</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">📊 Analytics</h3>
                <p className="text-sm text-muted-foreground">View raid and user statistics</p>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">🎵 Raids</h3>
                <p className="text-sm text-muted-foreground">Monitor active music raids</p>
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
