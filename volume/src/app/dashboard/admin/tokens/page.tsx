export default function ManageTokensPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Manage Tokens</h1>
        <p className="text-muted-foreground">Configure reward tokens and their properties</p>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <div className="space-y-4">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🪙</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Token Management</h3>
            <p className="text-muted-foreground mb-4">
              Token management features are being developed. This will include:
            </p>
            <div className="text-left max-w-md mx-auto space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>✓</span> Add new reward tokens
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Enable/disable tokens
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Configure token metadata (logos, decimals)
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Set default reward amounts
              </div>
              <div className="flex items-center gap-2">
                <span>✓</span> Monitor token balances
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}