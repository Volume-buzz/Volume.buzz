import { apiGet } from '@/lib/api-client';

interface ParticipantItem {
  id: number;
  qualified: boolean;
  claimed_reward: boolean;
  total_listen_duration: number;
  created_at: string;
  raid: {
    id: number;
    track_title?: string | null;
    track_artist?: string | null;
  };
}

export default async function MyRaidsPage() {
  const mine = await apiGet<ParticipantItem[]>("/api/raids/mine/list");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">My Raids</h1>
        <p className="text-muted-foreground">View all the raids you've participated in</p>
      </div>
      
      <div className="space-y-3">
        {mine.map((p) => (
          <div key={p.id} className="border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{p.raid?.track_title || 'Track'}</p>
                <p className="text-sm text-muted-foreground">{p.raid?.track_artist || ''}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Joined: {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right space-y-1">
                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  p.qualified 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                }`}>
                  {p.qualified ? 'Qualified' : 'In Progress'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Listened: {Math.floor(p.total_listen_duration / 60)}m {p.total_listen_duration % 60}s
                </p>
                {p.claimed_reward && (
                  <p className="text-xs text-green-600">Reward Claimed</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {!mine.length && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No raids joined yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Check out active raids to get started!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

