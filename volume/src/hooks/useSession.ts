'use client';

import { useEffect, useState } from 'react';

interface Session {
  discordId: string;
  name?: string;
  image?: string;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch session from API
    fetch('/api/auth/session')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) {
          setSession({
            discordId: data.discord_id || data.discordId,
            name: data.name,
            image: data.image,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { session, loading };
}
