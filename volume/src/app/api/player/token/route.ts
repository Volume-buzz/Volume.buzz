import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SpotifyAuth } from '@/lib/spotify-auth';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('spotify_access_token')?.value;
    const refreshToken = cookieStore.get('spotify_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token' }, { status: 401 });
    }

    // Test if token is still valid
    const testResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!testResponse.ok && refreshToken) {
      // Try to refresh the token
      try {
        const tokenData = await SpotifyAuth.refreshAccessToken(refreshToken);
        accessToken = tokenData.access_token;

        // Update the access token cookie
        const response = NextResponse.json({ access_token: accessToken });
        response.cookies.set('spotify_access_token', accessToken!, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: tokenData.expires_in,
        });

        return response;
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
      }
    }

    return NextResponse.json({ access_token: accessToken });
  } catch (error) {
    console.error('Get token error:', error);
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}
