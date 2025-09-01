

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  verified: boolean;
  avatar: string | null;
}

export interface DiscordTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export class DiscordAuth {
  static generateAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify email',
      state: state || crypto.randomUUID(),
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  static async exchangeCodeForTokens(code: string): Promise<DiscordTokens> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  static async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get Discord user: ${response.statusText}`);
    }

    const user = await response.json();
    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      email: user.email,
      verified: user.verified,
      avatar: user.avatar,
    };
  }

  static getAvatarUrl(user: DiscordUser): string {
    if (!user.avatar) {
      return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }
}
