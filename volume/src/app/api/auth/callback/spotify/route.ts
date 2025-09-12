import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAuth } from '@/lib/spotify-auth';
import { authSessions } from '@/lib/auth-sessions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    console.log('🔄 Spotify callback received');
    console.log('📋 Code present:', !!code);
    console.log('📋 State from URL:', state);
    console.log('📋 Error from URL:', error);
    console.log('🌐 Request URL:', request.url);
    console.log('📊 Session stats:', authSessions.getStats());

    // Handle authorization errors
    if (error) {
      console.error('Spotify authorization error:', error);
      return NextResponse.redirect(new URL('/dashboard/spotify?error=access_denied', request.url));
    }

    if (!code || !state) {
      console.error('❌ Missing code or state parameter');
      return NextResponse.redirect(new URL('/dashboard/spotify?error=invalid_request', request.url));
    }

    // Validate state parameter using session storage
    const session = authSessions.get(state);
    const codeVerifier = session?.codeVerifier;

    console.log('💾 Session found for state:', !!session);
    console.log('🔑 Code verifier present:', !!codeVerifier);
    console.log('🔍 Session valid:', !!session && !!codeVerifier);

    if (!session || !codeVerifier) {
      console.error('❌ State validation failed');
      console.error('   - Session found:', !!session);
      console.error('   - Received state:', state);
      console.error('   - Code verifier present:', !!codeVerifier);
      return NextResponse.redirect(new URL('/dashboard/spotify?error=state_mismatch', request.url));
    }

    // Clean up the used session
    authSessions.remove(state);

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging code for token...');
    const tokenData = await SpotifyAuth.exchangeCodeForToken(code, codeVerifier);
    console.log('✅ Token received, expires in:', tokenData.expires_in, 'seconds');
    console.log('🔄 Has refresh token:', !!tokenData.refresh_token);
    
    // Get user profile
    console.log('👤 Fetching user profile...');
    const userProfile = await SpotifyAuth.getUserProfile(tokenData.access_token);
    console.log('👤 User profile received:', userProfile.display_name, '- Premium:', userProfile.product === 'premium');

    // Following Spotify documentation - use client-side storage instead of cookies
    // Create a redirect with tokens in URL (will be handled by client-side script)
    const redirectUrl = new URL('/dashboard/spotify', process.env.APP_URL || request.url);
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    if (tokenData.refresh_token) {
      redirectUrl.searchParams.set('refresh_token', tokenData.refresh_token);
    }
    redirectUrl.searchParams.set('expires_in', tokenData.expires_in.toString());
    redirectUrl.searchParams.set('user_profile', JSON.stringify(userProfile));
    redirectUrl.searchParams.set('token_success', 'true');

    console.log('🔄 Redirecting to client with tokens');
    
    const response = NextResponse.redirect(redirectUrl);

    // Clean up temporary cookies
    response.cookies.delete('spotify_state');
    response.cookies.delete('spotify_code_verifier');

    return response;
  } catch (error) {
    console.error('Spotify callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard/spotify?error=token_exchange_failed', request.url)
    );
  }
}