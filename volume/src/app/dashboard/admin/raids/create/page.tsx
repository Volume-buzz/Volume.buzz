// Create raid page - Coming soon

export default function CreateRaidPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Create New Raid</h1>
        <p className="text-muted-foreground">Set up a new music listening raid with rewards</p>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <div className="space-y-4">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚧</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              The raid creation wizard is being built. This will include:
            </p>
            <div className="text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>✓</span> Discord server/channel selection
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Spotify track search and selection
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Raid parameters (duration, goal, requirements)
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Reward configuration
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Preview and publishing
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}