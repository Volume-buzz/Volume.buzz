import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { SpotifyAuth } from '@/lib/spotify-auth';
import { authSessions } from '@/lib/auth-sessions';

export async function GET(_request: NextRequest) {
  try {
    const { codeVerifier, codeChallenge } = SpotifyAuth.generatePKCEChallenge();
    const state = crypto.randomUUID();

    console.log('🚀 Starting Spotify premium auth flow');

    authSessions.store(state, codeVerifier);

    const authUrl = SpotifyAuth.generateAuthUrl(state, codeChallenge, 'premium');
    console.log('🎯 Redirecting to (premium):', authUrl);

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
    console.error('Spotify premium login error:', error);
    return NextResponse.json({ error: 'Failed to initiate Spotify premium login' }, { status: 500 });
  }
}

