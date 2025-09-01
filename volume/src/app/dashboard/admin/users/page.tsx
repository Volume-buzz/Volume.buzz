export default function ManageUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Manage Users</h1>
        <p className="text-muted-foreground">View and manage user roles and permissions</p>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <div className="space-y-4">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">User Management</h3>
            <p className="text-muted-foreground mb-4">
              User management features are being developed. This will include:
            </p>
            <div className="text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>✓</span> View all registered users
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Promote users to Artist/Admin roles
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> View user balances and activity
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Reset Spotify connections
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Search and filter users
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}