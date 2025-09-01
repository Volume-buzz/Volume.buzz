import { NextResponse } from 'next/server';
import { DiscordAuth } from '@/lib/discord-auth';

export async function GET() {
  try {
    // Generate Discord OAuth URL
    const state = crypto.randomUUID();
    const authUrl = DiscordAuth.generateAuthUrl(state);
    
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Discord login error:', error);
    return NextResponse.json({ error: 'Failed to initiate Discord login' }, { status: 500 });
  }
}
