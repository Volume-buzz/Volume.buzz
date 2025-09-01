"use client";
import Image from 'next/image';
import { useState } from 'react';

export function Topbar({ user }: { user: { name: string; image?: string | null } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="font-semibold text-foreground">Volume Dashboard</div>
        <div className="relative">
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2">
            <Image src={user.image || '/default-avatar.png'} alt="avatar" width={28} height={28} className="rounded-full"/>
            <span className="text-sm text-foreground">{user.name}</span>
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-40 rounded-md border bg-popover shadow-sm">
              <a href="/api/auth/logout" className="block px-3 py-2 text-sm hover:bg-muted">Logout</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

