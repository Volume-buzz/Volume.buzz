"use client";

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { PrivyWalletProvider } from '@/components/wallet/privy-provider';

function WalletPageContent() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();

  if (!ready) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2 text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Wallet Connection</h1>

        <div className="text-center py-12">
          <div className="text-6xl mb-6">👛</div>
          <h2 className="text-2xl font-semibold text-foreground mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Connect your Solana wallet to participate in raids and receive token rewards.
          </p>

          <button
            onClick={login}
            className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg transition-colors"
          >
            Connect Wallet
          </button>

          <div className="mt-8 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Supports Phantom, Solflare, Backpack</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Secure wallet connection</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-foreground">Wallet Connection</h1>

      <div className="grid gap-6">
        {/* Account Info */}
        <div className="p-6 bg-card rounded-lg border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">Account Information</h2>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md"
            >
              Disconnect
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">User ID:</div>
              <div className="font-mono text-sm bg-muted p-2 rounded break-all">
                {user?.id}
              </div>
            </div>

            {user?.createdAt && (
              <div>
                <div className="text-sm text-muted-foreground">Created:</div>
                <div className="text-sm text-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Connected Wallets */}
        <div className="p-6 bg-card rounded-lg border">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Connected Wallets</h2>

          <div className="space-y-3">
            {wallets.map((wallet) => (
              <div key={wallet.address} className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {wallet.walletClientType} Wallet
                    </div>
                    <div className="font-mono text-sm text-foreground">
                      {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Chain</div>
                    <div className="text-sm font-medium text-foreground">
                      Solana
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-background rounded text-xs">
                  <div className="text-muted-foreground mb-1">Full Address:</div>
                  <div className="font-mono break-all">{wallet.address}</div>
                </div>
              </div>
            ))}

            {user?.wallet && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Embedded Wallet</div>
                    <div className="font-mono text-sm text-foreground">
                      {user.wallet.address.slice(0, 8)}...{user.wallet.address.slice(-8)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Chain</div>
                    <div className="text-sm font-medium text-foreground">
                      Solana
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-background rounded text-xs">
                  <div className="text-muted-foreground mb-1">Full Address:</div>
                  <div className="font-mono break-all">{user.wallet.address}</div>
                </div>
              </div>
            )}

            {wallets.length === 0 && !user?.wallet && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-2xl mb-2">👛</div>
                <p>No wallets connected yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Success Message */}
        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✅ <strong>Wallet Connected!</strong> You're ready to participate in raids.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <PrivyWalletProvider>
      <WalletPageContent />
    </PrivyWalletProvider>
  );
}
