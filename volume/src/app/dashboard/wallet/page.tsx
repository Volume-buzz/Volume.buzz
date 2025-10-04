"use client";

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { PrivyWalletProvider } from '@/components/wallet/privy-provider';
import { tokenMillService } from '@/lib/tokenmill-service';
import { RaidTokenMetadata, MintResult, TokenCreationForm } from '@/types/raid';

function WalletPageContent() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { wallets: solanaWallets } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

  // Token creation state
  const [isMinting, setIsMinting] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [solBalance, setSolBalance] = useState<{
    hasEnough: boolean;
    balance: number;
    required: number;
    networkFee: number;
  } | null>(null);

  // Token creation form state
  const [formData, setFormData] = useState<TokenCreationForm>({
    tokenName: '',
    tokenSymbol: '',
    decimals: 9,
    initialSupply: 1000,
    spotifyTrackId: '',
    artistName: '',
    description: ''
  });

  // Check SOL balance
  const checkSolBalance = async () => {
    if (!user?.wallet?.address) {
      console.error('❌ No wallet address available');
      return;
    }

    try {
      const walletPublicKey = new PublicKey(user.wallet.address);
      const balance = await tokenMillService.checkSolBalance(walletPublicKey);
      setSolBalance(balance);
      console.log('💰 SOL Balance:', balance);
    } catch (error) {
      console.error('❌ Failed to check SOL balance:', error);
      setSolBalance({
        hasEnough: false,
        balance: 0,
        required: 0.02,
        networkFee: 0.005
      });
    }
  };


  // Create wallet adapter for Privy
  const createPrivyWalletAdapter = () => {
    if (solanaWallets.length > 0) {
      const solanaWallet = solanaWallets[0];

      const adapter = {
        publicKey: new PublicKey(solanaWallet.address),
        signTransaction: async (transaction: any) => {
          const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
          const result = await signTransaction({
            transaction: serializedTransaction,
            wallet: solanaWallet
          });
          return Transaction.from(result.signedTransaction);
        },
        signAllTransactions: async (transactions: any[]) => {
          const results = [];
          for (const tx of transactions) {
            const signed = await adapter.signTransaction(tx);
            results.push(signed);
          }
          return results;
        }
      };

      return adapter;
    }

    throw new Error('No Solana wallet found');
  };

  // Create token with TokenMill
  const createTokenWithTokenMill = async () => {
    if (!user?.wallet?.address) {
      alert('No wallet connected');
      return;
    }

    if (!formData.tokenName.trim() || !formData.tokenSymbol.trim()) {
      alert('Please fill in token name and symbol');
      return;
    }

    setIsMinting(true);
    setMintResult(null);

    try {
      const walletAdapter = createPrivyWalletAdapter();

      const metadata: RaidTokenMetadata = {
        name: formData.tokenName,
        symbol: formData.tokenSymbol,
        description: formData.description || `Volume raid token for ${formData.tokenName}`,
        supply: formData.initialSupply,
        spotifyTrackId: formData.spotifyTrackId,
        spotifyArtist: formData.artistName,
        image: '/volume-logo.png',
      };

      const result = await tokenMillService.createRaidToken(walletAdapter, metadata);
      setMintResult(result);

      if (result.success) {
        console.log('🎉 Token created successfully!', result);
      }
    } catch (error) {
      setMintResult({
        mintAddress: '',
        transactionSignature: '',
        tokenAccountAddress: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsMinting(false);
    }
  };

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

        {/* SOL Balance Check */}
        <div className="p-6 bg-card rounded-lg border">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Devnet SOL Balance</h2>

          <button
            onClick={checkSolBalance}
            disabled={!user?.wallet?.address}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            💰 Check SOL Balance
          </button>

          {solBalance && (
            <div className={`mt-4 p-4 rounded border ${
              solBalance.hasEnough
                ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
            }`}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={solBalance.hasEnough ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}>
                    <strong>Balance:</strong>
                  </span>
                  <span className={solBalance.hasEnough ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}>
                    {solBalance.balance.toFixed(4)} SOL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={solBalance.hasEnough ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                    <strong>Required:</strong>
                  </span>
                  <span className={solBalance.hasEnough ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                    {solBalance.required.toFixed(4)} SOL
                  </span>
                </div>
                <div className={`mt-2 p-2 rounded text-xs ${
                  solBalance.hasEnough
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                }`}>
                  {solBalance.hasEnough ? (
                    <>✅ Sufficient balance for token creation</>
                  ) : (
                    <>❌ Insufficient balance. Get devnet SOL from faucet.solana.com</>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Success Message */}
        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✅ <strong>Wallet Connected!</strong> You're ready to participate in raids.
          </p>
        </div>

        {/* Token Creation Section */}
        <div className="p-6 bg-card rounded-lg border">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-foreground">Create Raid Token</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create a Solana token with metadata for your raid
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Token Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Volume Raid - Song Name"
                  value={formData.tokenName}
                  onChange={(e) => setFormData({...formData, tokenName: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Token Symbol *
                </label>
                <input
                  type="text"
                  placeholder="e.g., VRAID"
                  value={formData.tokenSymbol}
                  onChange={(e) => setFormData({...formData, tokenSymbol: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Decimals
                  </label>
                  <input
                    type="number"
                    value={formData.decimals}
                    onChange={(e) => setFormData({...formData, decimals: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Initial Supply
                  </label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={formData.initialSupply}
                    onChange={(e) => setFormData({...formData, initialSupply: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Spotify Track ID
                </label>
                <input
                  type="text"
                  placeholder="e.g., 4iV5W9uYEdYUVa79Axb7Rh"
                  value={formData.spotifyTrackId}
                  onChange={(e) => setFormData({...formData, spotifyTrackId: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Artist Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., The Artist"
                  value={formData.artistName}
                  onChange={(e) => setFormData({...formData, artistName: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Describe your raid token..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

            </div>

            {/* Quick Test Button */}
            <button
              onClick={() => {
                const timestamp = Date.now().toString().slice(-4);
                setFormData({
                  tokenName: `Test Raid Token #${timestamp}`,
                  tokenSymbol: `TEST${timestamp}`,
                  decimals: 9,
                  initialSupply: 1000,
                  spotifyTrackId: 'test123',
                  artistName: 'Test Artist',
                  description: 'Test token for Volume raid'
                });
                setTimeout(() => createTokenWithTokenMill(), 100);
              }}
              disabled={isMinting || !user?.wallet?.address}
              className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ⚡ Quick Test (Sample Data + Logo)
            </button>

            {/* Create Token Button */}
            <button
              onClick={createTokenWithTokenMill}
              disabled={isMinting || !user?.wallet?.address || !formData.tokenName.trim() || !formData.tokenSymbol.trim()}
              className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isMinting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating Token...
                </>
              ) : (
                <>
                  🚀 Create Token with Metadata
                </>
              )}
            </button>

            {/* Mint Result */}
            {mintResult && (
              <div className={`p-4 rounded border ${
                mintResult.success
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
              }`}>
                {mintResult.success ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-green-800 dark:text-green-200">
                      ✅ Token Created Successfully!
                    </div>
                    <div className="space-y-1 text-xs text-green-700 dark:text-green-300">
                      <div className="break-all">
                        <strong>Mint Address:</strong> {mintResult.mintAddress}
                      </div>
                      <div className="break-all">
                        <strong>Transaction:</strong> {mintResult.transactionSignature}
                      </div>
                      <div className="break-all">
                        <strong>Token Account:</strong> {mintResult.tokenAccountAddress}
                      </div>
                    </div>
                    <div className="mt-3 p-2 bg-green-100 dark:bg-green-900 rounded text-xs text-green-800 dark:text-green-200">
                      🎉 Token created with metadata! Check your wallet.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-red-800 dark:text-red-200">
                      ❌ Token Creation Failed
                    </div>
                    <div className="text-xs text-red-700 dark:text-red-300">
                      <strong>Error:</strong> {mintResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
