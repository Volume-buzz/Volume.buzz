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
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Spotify premium login error:', error);
    return NextResponse.json({ error: 'Failed to initiate Spotify premium login' }, { status: 500 });
  }
}


