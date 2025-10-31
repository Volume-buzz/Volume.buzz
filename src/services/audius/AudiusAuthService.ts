import PrismaDatabase from '../../database/prisma';

interface AudiusProfilePicture {
  '150x150'?: string;
  '480x480'?: string;
  '1000x1000'?: string;
  misc?: string;
}

export interface AudiusVerifiedProfile {
  userId: string;
  email: string;
  name: string;
  handle: string;
  verified: boolean;
  profilePicture?: AudiusProfilePicture | null;
}

interface AudiusAuthConfig {
  apiKey: string;
  appName: string;
  loginRedirectUrl?: string;
  apiPublicUrl: string;
}

export default class AudiusAuthService {
  private apiKey: string;
  private appName: string;
  private loginRedirectUrl?: string;
  private apiPublicUrl: string;
  private discoveryNodeUrl: string | null = null;
  private discoveryNodeFetchedAt = 0;

  constructor(options: AudiusAuthConfig) {
    this.apiKey = options.apiKey;
    this.appName = options.appName;
    this.loginRedirectUrl = options.loginRedirectUrl;
    this.apiPublicUrl = options.apiPublicUrl;
  }

  /**
   * Generate the redirect URI that Audius should call after authorization.
   */
  public getRedirectUri(): string {
    if (this.loginRedirectUrl) {
      return this.loginRedirectUrl;
    }
    const base = this.apiPublicUrl?.replace(/\/$/, '') || 'http://localhost:3001';
    return `${base}/auth/audius/callback`;
  }

  /**
   * Generate the OAuth authorization URL for Audius Identity Service.
   */
  public generateAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'token',
      client_id: this.apiKey,
      redirect_uri: this.getRedirectUri(),
      scope: 'read',
      state,
      app_name: this.appName || 'volume-bot',
      response_mode: 'fragment',
      display: 'web'
    });

    return `https://audius.co/oauth/auth?${params.toString()}`;
  }

  /**
   * Verify an ID token and return the Audius profile.
   */
  public async verifyToken(token: string): Promise<AudiusVerifiedProfile> {
    const discoveryNode = await this.getDiscoveryNodeUrl();
    const url = new URL('/v1/users/verify_token', discoveryNode);
    url.searchParams.set('token', token);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Audius token verification failed: ${text}`);
    }

    const json = await response.json() as { data: AudiusVerifiedProfile };
    if (!json?.data) {
      throw new Error('Audius token verification returned no data');
    }

    return json.data;
  }

  /**
   * Render callback HTML which forwards the token payload to the backend.
   */
  public getCallbackPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Audius Login</title>
    <style>
      body {
        font-family: "Inter", system-ui, sans-serif;
        background: #121212;
        color: #fff;
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        position: relative;
      }
      /* Dashed Grid Background */
      body::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        background-image:
          linear-gradient(to right, rgba(231, 229, 228, 0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(231, 229, 228, 0.05) 1px, transparent 1px);
        background-size: 20px 20px;
        background-position: 0 0, 0 0;
        mask-image:
          repeating-linear-gradient(
            to right,
            black 0px,
            black 3px,
            transparent 3px,
            transparent 8px
          ),
          repeating-linear-gradient(
            to bottom,
            black 0px,
            black 3px,
            transparent 3px,
            transparent 8px
          );
        -webkit-mask-image:
          repeating-linear-gradient(
            to right,
            black 0px,
            black 3px,
            transparent 3px,
            transparent 8px
          ),
          repeating-linear-gradient(
            to bottom,
            black 0px,
            black 3px,
            transparent 3px,
            transparent 8px
          );
        mask-composite: intersect;
        -webkit-mask-composite: source-in;
      }
      .card {
        background: rgba(27, 27, 27, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 36px 40px;
        max-width: 460px;
        width: 100%;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
        text-align: center;
        position: relative;
        z-index: 1;
      }
      h1 {
        font-size: 1.9rem;
        margin-bottom: 12px;
        color: #ffffff;
      }
      p {
        color: rgba(255,255,255,0.6);
        line-height: 1.6;
      }
      .status {
        margin-top: 24px;
        font-size: 0.95rem;
      }
      .status.error {
        color: #fca5a5;
      }
      .status.success {
        color: #6ee7b7;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Completing Audius Login</h1>
      <p>Finishing up your Audius authentication. This window will close automatically.</p>
      <div class="status" id="status">Processing...</div>
    </div>
    <script>
      (function () {
        const statusEl = document.getElementById('status');
        const params = new URLSearchParams(window.location.hash.substring(1));
        const state = params.get('state');
        const token = params.get('token');

        if (!state || !token) {
          statusEl.textContent = 'Missing authentication data. You can close this window and try again.';
          statusEl.className = 'status error';
          return;
        }

        fetch('/auth/audius/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ state, token })
        })
        .then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to link Audius account.');
          }
          statusEl.textContent = 'Audius account linked! You can close this window.';
          statusEl.className = 'status success';
          setTimeout(() => window.close(), 2500);
        })
        .catch((err) => {
          console.error('Audius token exchange failed:', err);
          statusEl.textContent = err.message || 'Something went wrong. Please close this window and try again.';
          statusEl.className = 'status error';
        });
      })();
    </script>
  </body>
</html>`;
  }

  /**
   * Persist the verified Audius profile to the database.
   */
  public async saveUserProfile(discordId: string, profile: AudiusVerifiedProfile, options: { discordUsername?: string } = {}): Promise<void> {
    const picture = profile.profilePicture || undefined;
    const pictureUrl =
      (picture && (picture['1000x1000'] || picture['480x480'] || picture['150x150'] || picture['misc'])) || undefined;

    await PrismaDatabase.updateUser(discordId, {
      audiusUserId: profile.userId,
      audiusHandle: profile.handle,
      audiusName: profile.name,
      audiusEmail: profile.email,
      audiusProfilePicture: pictureUrl,
      audiusVerified: profile.verified,
      discordUsername: options.discordUsername
    });
  }

  private async getDiscoveryNodeUrl(): Promise<string> {
    const now = Date.now();
    if (this.discoveryNodeUrl && (now - this.discoveryNodeFetchedAt) < 5 * 60 * 1000) {
      return this.discoveryNodeUrl;
    }

    const response = await fetch('https://api.audius.co');
    if (!response.ok) {
      throw new Error(`Failed to fetch Audius discovery nodes: ${response.statusText}`);
    }

    const json = await response.json();
    const endpoints: string[] = Array.isArray(json?.data) ? json.data : [];
    if (!endpoints.length) {
      throw new Error('Audius discovery nodes response did not contain endpoints');
    }

    const selected = endpoints[Math.floor(Math.random() * endpoints.length)];
    this.discoveryNodeUrl = selected;
    this.discoveryNodeFetchedAt = now;
    return selected;
  }
}
