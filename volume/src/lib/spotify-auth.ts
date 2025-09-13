// Spotify PKCE OAuth flow utilities
import crypto from 'crypto';

export class SpotifyAuth {
  private static CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
  private static CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
  private static REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `${process.env.APP_URL}/api/auth/callback/spotify`;

  // Generate code verifier and challenge for PKCE
  static generatePKCEChallenge() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    
    return {
      codeVerifier,
      codeChallenge
    };
  }

  // Generate Spotify authorization URL
  static getScopes(mode: 'minimal' | 'premium' = 'minimal') {
    if (mode === 'premium') {
      return [
        'streaming',
        'user-read-private',
        'user-read-email',
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-currently-playing'
      ];
    }
    return [
      'user-read-private',
      'user-read-email'
    ];
  }

  static generateAuthUrl(state: string, codeChallenge: string, mode: 'minimal' | 'premium' = 'minimal') {
    const scope = this.getScopes(mode).join(' ');

    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      response_type: 'code',
      redirect_uri: this.REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      state,
      scope
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  static async exchangeCodeForToken(code: string, codeVerifier: string) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  // Refresh access token
  static async refreshAccessToken(refreshToken: string) {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    return response.json();
  }

  // Get user profile from Spotify API
  static async getUserProfile(accessToken: string) {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    return response.json();
  }
}