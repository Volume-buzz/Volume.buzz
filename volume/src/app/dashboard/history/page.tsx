import { apiGet } from '@/lib/api-client';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

interface ParticipantHistoryItem {
  id: number;
  qualified: boolean;
  claimed_reward: boolean;
  claimed_at?: string | null;
  total_listen_duration: number;
  raid: {
    id: number;
    track_title?: string | null;
    track_artist?: string | null;
  };
}

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const items = await apiGet<ParticipantHistoryItem[]>("/api/raids/history/list");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4 text-foreground">Raid History</h1>
      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.id} className="border rounded-md p-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{p.raid?.track_title || 'Track'}</p>
                <p className="text-xs text-muted-foreground">{p.raid?.track_artist || ''}</p>
              </div>
              <div className="text-right">
                <p className="text-xs">Qualified: {p.qualified ? 'Yes' : 'No'}</p>
                <p className="text-xs">Claimed: {p.claimed_reward ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground">No history yet.</p>}
      </div>
    </div>
  );
}

