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
    
    // Implement retry logic for rate limiting
    const maxRetries = 3;
    let success = false;
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(botCallbackUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          console.log('✅ Successfully forwarded Spotify OAuth callback to bot');
          success = true;
          break; // Success, exit retry loop
        }

        const errorText = await response.text();
        
        // Handle rate limiting (429) with exponential backoff
        if (response.status === 429) {
          lastError = errorText;
          console.warn(`⏱️ Bot API rate limited (attempt ${attempt}/${maxRetries}):`, errorText);
          
          if (attempt < maxRetries) {
            // Parse retry-after from response or use exponential backoff
            let retryAfter = 2 ** attempt; // 2, 4, 8 seconds
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.retryAfter) {
                retryAfter = Math.min(errorData.retryAfter, 30); // Cap at 30 seconds
              }
            } catch {
              // Use exponential backoff if can't parse retry-after
            }
            
            console.log(`⏳ Retrying in ${retryAfter} seconds...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
        } else {
          // Non-429 errors should fail immediately
          lastError = errorText;
          console.error('Bot API callback failed:', response.status, errorText);
          break;
        }
      } catch (fetchError) {
        lastError = String(fetchError);
        console.error(`Network error on attempt ${attempt}:`, fetchError);
        
        if (attempt < maxRetries) {
          const retryAfter = 2 ** attempt;
          console.log(`⏳ Retrying in ${retryAfter} seconds due to network error...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
      }
    }

    if (success) {
      return NextResponse.json({ success: true });
    }

    // If we've exhausted all retries, return error
    return NextResponse.json({ 
      error: 'Failed to process OAuth callback with bot after retries',
      details: lastError
    }, { status: 500 });

  } catch (error) {
    console.error('Error in Spotify OAuth callback:', error);
    return NextResponse.json({ 
      error: 'Internal server error processing OAuth callback' 
    }, { status: 500 });
  }
}
