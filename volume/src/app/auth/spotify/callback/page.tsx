"use client";

import React, { useEffect, useState, Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { CanvasRevealEffect } from "@/components/forms/auth-form";

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message: string;
  details?: string;
}

function SpotifyCallbackContent() {
  const searchParams = useSearchParams();
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: 'loading',
    message: 'Processing your Spotify connection...'
  });

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      setCallbackState({
        status: 'error',
        message: 'Spotify Authentication Failed',
        details: `Error: ${error}. You can close this tab and try again in Discord.`
      });
      return;
    }

    if (!code || !state) {
      setCallbackState({
        status: 'error',
        message: 'Invalid Request',
        details: 'Missing authorization code or state parameter. You can close this tab and try again in Discord.'
      });
      return;
    }

    // Call the bot's OAuth handler
    const handleOAuth = async () => {
      try {
        // Forward the OAuth callback to the bot's API
        const response = await fetch(`/api/auth/spotify/callback?code=${code}&state=${state}`, {
          method: 'GET',
        });

        if (response.ok) {
          setCallbackState({
            status: 'success',
            message: 'Successfully Connected to Spotify!',
            details: 'Your Spotify account has been linked to your Discord account. You can now participate in music raids and earn rewards!'
          });
        } else {
          await response.text(); // Consume the response
          setCallbackState({
            status: 'error',
            message: 'Connection Failed',
            details: 'Failed to link your Spotify account. Please try again in Discord.'
          });
        }
      } catch {
        setCallbackState({
          status: 'error',
          message: 'Connection Failed',
          details: 'Network error occurred. Please try again in Discord.'
        });
      }
    };

    handleOAuth();
  }, [searchParams]);

  const getStatusIcon = () => {
    switch (callbackState.status) {
      case 'loading':
        return (
          <svg className="animate-spin h-12 w-12 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'success':
        return null;
      case 'error':
        return (
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        );
    }
  };

  const getStatusColor = () => {
    switch (callbackState.status) {
      case 'success':
        return 'text-[#1DB954]';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  return (
    <div className="flex w-full flex-col min-h-screen bg-black relative">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0">
          <CanvasRevealEffect
            animationSpeed={2}
            containerClassName="bg-black"
            colors={[
              [255, 255, 255],
              [255, 255, 255],
            ]}
            dotSize={4}
            reverse={false}
          />
        </div>
        
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.8)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>
      
      {/* Content Layer */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center space-y-6"
          >
            {/* Status Icon */}
            {getStatusIcon() && (
              <motion.div 
                className="flex justify-center"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                {getStatusIcon()}
              </motion.div>
            )}

            {/* Status Message */}
            <div className="space-y-2">
              <h1 className={`text-3xl font-bold leading-tight tracking-tight ${getStatusColor()}`}>
                {callbackState.message}
              </h1>
              {callbackState.details && (
                <p className="text-lg text-white/70 font-light max-w-sm mx-auto">
                  {callbackState.details}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            {callbackState.status !== 'loading' && (
              <motion.div 
                className="space-y-3 pt-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                {callbackState.status === 'success' ? (
                  <>
                    <button 
                      onClick={() => window.close()}
                      className="w-full rounded-full bg-[#1DB954] text-white font-medium py-3 hover:bg-[#1ed760] transition-colors"
                    >
                      Close Tab
                    </button>
                    <p className="text-sm text-white/50">
                      You can now return to Discord and start participating in raids!
                    </p>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => window.close()}
                      className="w-full rounded-full bg-white/10 text-white border border-white/20 font-medium py-3 hover:bg-white/20 transition-colors"
                    >
                      Close Tab
                    </button>
                    <p className="text-sm text-white/50">
                      Please return to Discord and try the login command again.
                    </p>
                  </>
                )}
              </motion.div>
            )}

            {/* Spotify Branding */}
            <motion.div 
              className="flex items-center justify-center gap-2 pt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#1DB954">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.959-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.361 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              <span className="text-sm text-white/60">Powered by Spotify</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function SpotifyCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex w-full flex-col min-h-screen bg-black relative">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={2}
              containerClassName="bg-black"
              colors={[
                [255, 255, 255],
                [255, 255, 255],
              ]}
              dotSize={4}
              reverse={false}
            />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.8)_0%,_transparent_100%)]" />
        </div>
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <div className="text-center">
            <svg className="animate-spin h-12 w-12 text-white mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-white mt-4">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <SpotifyCallbackContent />
    </Suspense>
  );
}