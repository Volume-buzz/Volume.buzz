'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { useRouter, useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

type LinkStatus = 'loading' | 'connecting' | 'success' | 'error';

type VerifyStateResponse = {
  discord_id: string;
};

function WalletConnectContent() {
  const { ready, authenticated, user, login, connectWallet } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<LinkStatus>('loading');
  const [message, setMessage] = useState<string>('');

  const loginPromptedRef = useRef(false);
  const walletPromptedRef = useRef(false);
  const linkingRef = useRef(false);

  const state = searchParams.get('state');
  const redirectUri = searchParams.get('redirect_uri');

  const embeddedWalletAddress = user?.wallet?.address ?? null;
  const walletAddress = useMemo(() => {
    if (solanaWallets.length > 0) {
      return solanaWallets[0].address;
    }
    return embeddedWalletAddress;
  }, [embeddedWalletAddress, solanaWallets]);

  const resetPrompts = useCallback(() => {
    loginPromptedRef.current = false;
    walletPromptedRef.current = false;
  }, []);

  const promptLogin = useCallback(async () => {
    if (!login) return;
    try {
      await login();
    } catch (error) {
      console.error('Privy login error:', error);
      setStatus('error');
      setMessage('Unable to open Privy login. Please try again.');
      loginPromptedRef.current = false;
    }
  }, [login]);

  const promptWalletConnect = useCallback(async () => {
    if (!connectWallet) {
      setStatus('error');
      setMessage('Wallet connection is currently unavailable. Please try again later.');
      walletPromptedRef.current = false;
      return;
    }

    try {
      await connectWallet({
        walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
      });
    } catch (error) {
      console.error('Wallet connect error:', error);
      setStatus('error');
      setMessage('Could not open the wallet selector. Please try again.');
      walletPromptedRef.current = false;
    }
  }, [connectWallet]);

  const linkWalletToDiscord = useCallback(
    async (address: string) => {
      try {
        if (!state || !user) {
          throw new Error('Missing connection information.');
        }

        setStatus('connecting');
        setMessage('Linking wallet to Discord...');

        const verifyRes = await fetch(
          `${API_BASE}/api/auth/verify-state?state=${encodeURIComponent(state)}`,
          {
            credentials: 'include',
          }
        );

        if (!verifyRes.ok) {
          throw new Error('Invalid or expired connection request. Please restart the flow.');
        }

        const verifyData = (await verifyRes.json()) as VerifyStateResponse;

        const linkRes = await fetch(`${API_BASE}/api/wallet/link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            discord_id: verifyData.discord_id,
            privy_user_id: user.id,
            privy_wallet_address: address,
          }),
        });

        if (!linkRes.ok) {
          throw new Error('Failed to link wallet. Please try again.');
        }

        setStatus('success');
        setMessage('Wallet linked successfully! You can return to Discord.');

        if (redirectUri) {
          setTimeout(() => {
            window.location.href = decodeURIComponent(redirectUri);
          }, 2000);
        }
      } catch (error: any) {
        console.error('Error linking wallet:', error);
        setStatus('error');
        setMessage(error?.message || 'Failed to link wallet. Please try again.');
        resetPrompts();
      } finally {
        linkingRef.current = false;
      }
    },
    [redirectUri, resetPrompts, state, user]
  );

  useEffect(() => {
    if (!state) {
      setStatus('error');
      setMessage('Invalid connection request. Missing state parameter.');
      return;
    }

    if (!ready) {
      setStatus('loading');
      setMessage('Loading Privy session...');
      return;
    }

    if (!authenticated) {
      setStatus('connecting');
      setMessage('Sign in with Privy to continue.');
      if (!loginPromptedRef.current) {
        loginPromptedRef.current = true;
        void promptLogin();
      }
      return;
    }

    if (!walletAddress) {
      setStatus('connecting');
      setMessage('Connect a Solana wallet to continue.');
      if (!walletPromptedRef.current) {
        walletPromptedRef.current = true;
        void promptWalletConnect();
      }
      return;
    }

    if (!linkingRef.current) {
      linkingRef.current = true;
      void linkWalletToDiscord(walletAddress);
    }
  }, [authenticated, linkWalletToDiscord, promptLogin, promptWalletConnect, ready, state, walletAddress]);

  const handleManualLogin = useCallback(() => {
    loginPromptedRef.current = true;
    void promptLogin();
  }, [promptLogin]);

  const handleManualWalletConnect = useCallback(() => {
    walletPromptedRef.current = true;
    void promptWalletConnect();
  }, [promptWalletConnect]);

  const handleRetry = useCallback(() => {
    resetPrompts();
    linkingRef.current = false;

    if (!authenticated) {
      setStatus('connecting');
      setMessage('Sign in with Privy to continue.');
      handleManualLogin();
      return;
    }

    if (!walletAddress) {
      setStatus('connecting');
      setMessage('Connect a Solana wallet to continue.');
      handleManualWalletConnect();
      return;
    }

    linkingRef.current = true;
    void linkWalletToDiscord(walletAddress);
  }, [authenticated, handleManualLogin, handleManualWalletConnect, linkWalletToDiscord, resetPrompts, walletAddress]);

  const renderStatusContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white/60" />
            <p className="text-white/60 mt-4">{message || 'Loading...'}</p>
          </div>
        );
      case 'connecting':
        return (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white/70">
              {message}
            </div>
            <div className="space-y-3">
              {!authenticated && (
                <button
                  onClick={handleManualLogin}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200"
                >
                  Sign in with Privy
                </button>
              )}
              {authenticated && !walletAddress && (
                <button
                  onClick={handleManualWalletConnect}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200"
                >
                  Connect Solana Wallet
                </button>
              )}
              {authenticated && walletAddress && (
                <button
                  onClick={() => {
                    if (!linkingRef.current) {
                      linkingRef.current = true;
                      void linkWalletToDiscord(walletAddress);
                    }
                  }}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200"
                >
                  Continue Linking
                </button>
              )}
            </div>
          </div>
        );
      case 'success':
        return (
          <div className="text-center py-8">
            <div className="inline-block p-4 bg-emerald-500/20 rounded-full mb-4">
              <svg
                className="w-12 h-12 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Success!</h3>
            <p className="text-white/70">{message}</p>
            {walletAddress && (
              <div className="mt-4 p-4 bg-white/5 rounded-lg">
                <p className="text-xs text-white/50 mb-1">Wallet Address</p>
                <p className="text-xs font-mono text-white/80 break-all">{walletAddress}</p>
              </div>
            )}
          </div>
        );
      case 'error':
      default:
        return (
          <div className="text-center py-8">
            <div className="inline-block p-4 bg-red-500/20 rounded-full mb-4">
              <svg
                className="w-12 h-12 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connection Failed</h3>
            <p className="text-white/70 mb-4">{message}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleRetry}
                className="w-full sm:w-auto bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-all duration-200"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="w-full sm:w-auto text-white/60 hover:text-white underline"
              >
                Go Back
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#121212] text-white">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(231,229,228,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(231,229,228,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 0',
          maskImage:
            'repeating-linear-gradient(to right, black 0px, black 3px, transparent 3px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 3px, transparent 3px, transparent 8px)',
          WebkitMaskImage:
            'repeating-linear-gradient(to right, black 0px, black 3px, transparent 3px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 3px, transparent 3px, transparent 8px)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl border border-white/5 bg-[#1b1b1b] p-8 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-block rounded-full bg-white/5 p-4">
              <svg
                className="w-12 h-12 text-white/70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold text-white mb-2">Connect Your Wallet</h1>
            <p className="text-sm text-white/60">Link your Solana wallet to your Discord account</p>
          </div>

          {renderStatusContent()}

          <div className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-white/40">
            Powered by Privy
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WalletConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#121212]">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white/60" />
        </div>
      }
    >
      <WalletConnectContent />
    </Suspense>
  );
}
