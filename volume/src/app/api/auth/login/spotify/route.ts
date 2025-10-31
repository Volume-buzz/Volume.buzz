import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { SpotifyAuth } from '@/lib/spotify-auth';
import { authSessions } from '@/lib/auth-sessions';

export async function GET(_request: NextRequest) {
  try {
    // Generate PKCE challenge and state
    const { codeVerifier, codeChallenge } = SpotifyAuth.generatePKCEChallenge();
    const state = crypto.randomUUID();
    
    console.log('🚀 Starting Spotify auth flow');
    console.log('🔑 Generated state:', state);
    console.log('🔑 Code verifier length:', codeVerifier.length);
    console.log('🔗 Redirect URI from env:', process.env.SPOTIFY_REDIRECT_URI);
    console.log('🔗 APP_URL from env:', process.env.APP_URL);
    console.log('🔑 Client ID from env:', process.env.SPOTIFY_CLIENT_ID ? 'SET' : 'MISSING');
    
    // Store session
    authSessions.store(state, codeVerifier);
    
    // Generate authorization URL (premium scopes for full functionality)
    const authUrl = SpotifyAuth.generateAuthUrl(state, codeChallenge, 'premium');
    
    console.log('🎯 Redirecting to:', authUrl);

    const response = NextResponse.redirect(authUrl);
    const secure = process.env.NODE_ENV === 'production';

    response.cookies.set({
      name: 'spotify_state',
      value: state,
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 600,
      path: '/'
    });

    response.cookies.set({
      name: 'spotify_code_verifier',
      value: codeVerifier,
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 600,
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('Spotify login error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Spotify login' },
      { status: 500 }
    );
  }
}
