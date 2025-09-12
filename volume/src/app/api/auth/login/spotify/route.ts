import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAuth } from '@/lib/spotify-auth';
import { authSessions } from '@/lib/auth-sessions';

export async function GET(request: NextRequest) {
  try {
    // Generate PKCE challenge and state
    const { codeVerifier, codeChallenge } = SpotifyAuth.generatePKCEChallenge();
    const state = crypto.randomUUID();
    
    console.log('🚀 Starting Spotify auth flow');
    console.log('🔑 Generated state:', state);
    console.log('🔑 Code verifier length:', codeVerifier.length);
    console.log('🔗 Redirect URI from env:', process.env.SPOTIFY_REDIRECT_URI);
    
    // Store session
    authSessions.store(state, codeVerifier);
    
    // Generate authorization URL
    const authUrl = SpotifyAuth.generateAuthUrl(state, codeChallenge);
    
    console.log('🎯 Redirecting to:', authUrl);
    
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Spotify login error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Spotify login' },
      { status: 500 }
    );
  }
}