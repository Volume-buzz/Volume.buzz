import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'No active session' }, { status: 401 });
    }

    return NextResponse.json({
      user_id: session.userId,
      discord_id: session.discordId,
      email: session.email,
      name: session.name,
      image: session.image,
      discord_access_token: session.discordAccessToken,
      discord_token_expires_at: session.discordTokenExpiresAt,
    });
  } catch (error) {
    console.error('Failed to fetch session info:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
