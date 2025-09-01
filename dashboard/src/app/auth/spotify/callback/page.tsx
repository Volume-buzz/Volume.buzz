'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Prism from '@/components/ui/prism';

function SpotifyCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Spotify authorization failed: ${error}`);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing authorization parameters. Please try again.');
      return;
    }

    // Send the callback data to your backend
    fetch('/api/auth/spotify/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setMessage('Your Spotify account has been successfully connected!');
          
          // Auto-close window after 3 seconds
          setTimeout(() => {
            window.close();
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to connect Spotify account');
        }
      })
      .catch(err => {
        setStatus('error');
        setMessage('Network error. Please try again.');
        console.error('Callback error:', err);
      });
  }, [searchParams]);

  return (
    <div className="relative min-h-screen w-screen overflow-hidden bg-black flex items-center justify-center p-4">
      {/* Prism Background */}
      <div className="absolute inset-0 -z-10">
        <Prism
          animationType="rotate"
          timeScale={0.2}
          height={3.2}
          baseWidth={4.8}
          scale={2.8}
          hueShift={1.6}
          colorFrequency={0.6}
          noise={0.1}
          glow={2.0}
          bloom={1.8}
          transparent={true}
        />
      </div>

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60 pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 p-2">
              <Image 
                src="/logo.png" 
                alt="Spotify Discord Bot"
                width={24}
                height={24}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="text-white/90 text-lg font-light tracking-tight">
              Spotify Discord Bot
            </div>
          </div>

          {status === 'loading' && (
            <>
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-2 border-green-500/20 border-t-green-400 animate-spin mx-auto"></div>
              </div>
              <h1 className="text-2xl font-extralight text-white mb-3">Connecting Spotify...</h1>
              <p className="text-white/60 font-light">Please wait while we process your authorization.</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-extralight text-green-400 mb-3">Spotify Connected!</h1>
              <p className="text-white/70 font-light mb-6">{message}</p>
              <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5">
                <p className="text-sm text-white/60 font-light">
                  🎉 You can now participate in music raids and earn crypto rewards. This window will close automatically.
                </p>
              </div>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-extralight text-red-400 mb-3">Connection Failed</h1>
              <p className="text-white/70 font-light mb-6">{message}</p>
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                <p className="text-sm text-white/60 font-light">
                  You can close this window and try the <code className="bg-white/10 px-2 py-1 rounded text-green-300">/login</code> command again in Discord.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpotifyCallback() {
  return (
    <Suspense fallback={
      <div className="relative min-h-screen w-screen overflow-hidden bg-black flex items-center justify-center p-4">
        <div className="absolute inset-0 -z-10">
          <Prism
            animationType="rotate"
            timeScale={0.2}
            height={3.2}
            baseWidth={4.8}
            scale={2.8}
            hueShift={1.6}
            colorFrequency={0.6}
            noise={0.1}
            glow={2.0}
            bloom={1.8}
            transparent={true}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60 pointer-events-none" />
        <div className="relative w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full border-2 border-green-500/20 border-t-green-400 animate-spin mx-auto mb-4"></div>
            <h1 className="text-2xl font-extralight text-white mb-2">Loading...</h1>
          </div>
        </div>
      </div>
    }>
      <SpotifyCallbackContent />
    </Suspense>
  );
}