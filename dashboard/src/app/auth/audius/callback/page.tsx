'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AudiusCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [userInfo, setUserInfo] = useState<{name: string; handle: string; verified?: boolean} | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setMessage(`Audius authorization failed: ${error}`);
      return;
    }

    if (!token || !state) {
      setStatus('error');
      setMessage('Missing authorization parameters. Please try again.');
      return;
    }

    // Send the callback data to your backend
    fetch('/api/auth/audius/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, state }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          setUserInfo(data.user);
          setMessage('Your Audius account has been successfully connected!');
          
          // Auto-close window after 4 seconds
          setTimeout(() => {
            window.close();
          }, 4000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Failed to connect Audius account');
        }
      })
      .catch(err => {
        setStatus('error');
        setMessage('Network error. Please try again.');
        console.error('Callback error:', err);
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Connecting Audius...</h1>
            <p className="text-gray-600">Please wait while we process your authorization.</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-purple-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-purple-600 mb-2">🎵 Audius Connected!</h1>
            {userInfo && (
              <div className="mb-4">
                <p className="text-lg font-semibold text-gray-800">{userInfo.name}</p>
                <p className="text-purple-600">@{userInfo.handle}</p>
                {userInfo.verified && <span className="text-sm text-yellow-500">✅ Verified Artist</span>}
              </div>
            )}
            <p className="text-gray-700 mb-4">{message}</p>
            <p className="text-sm text-gray-500">This window will close automatically, or you can close it manually.</p>
            <p className="text-xs text-gray-400 mt-2">Return to Discord to start earning crypto rewards! 🚀</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="text-red-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">❌ Connection Failed</h1>
            <p className="text-gray-700 mb-4">{message}</p>
            <p className="text-sm text-gray-500">You can close this window and try again in Discord.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AudiusCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Loading...</h1>
        </div>
      </div>
    }>
      <AudiusCallbackContent />
    </Suspense>
  );
}