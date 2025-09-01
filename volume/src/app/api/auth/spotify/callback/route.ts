import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('Spotify OAuth error:', error);
      return NextResponse.json({ error: 'OAuth error from Spotify' }, { status: 400 });
    }

    if (!code || !state) {
      console.error('Missing code or state in Spotify callback');
      return NextResponse.json({ error: 'Missing authorization code or state' }, { status: 400 });
    }

    // Forward the OAuth callback to the bot's API
    const botApiUrl = process.env.BOT_API_URL;
    if (!botApiUrl) {
      console.error('BOT_API_URL not configured');
      return NextResponse.json({ error: 'Bot API URL not configured' }, { status: 500 });
    }

    const botCallbackUrl = `${botApiUrl}/auth/spotify/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    
    console.log(`🔄 Forwarding Spotify OAuth callback to bot: ${botCallbackUrl}`);
    
    const response = await fetch(botCallbackUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Bot API callback failed:', response.status, errorText);
      return NextResponse.json({ 
        error: 'Failed to process OAuth callback with bot' 
      }, { status: 500 });
    }

    console.log('✅ Successfully forwarded Spotify OAuth callback to bot');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in Spotify OAuth callback:', error);
    return NextResponse.json({ 
      error: 'Internal server error processing OAuth callback' 
    }, { status: 500 });
  }
}
