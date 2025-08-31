import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    // Forward to your backend OAuth service
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const response = await fetch(`${backendUrl}/oauth/spotify/login/${sessionId}`, {
      method: 'GET',
      redirect: 'manual' // Don't follow redirects automatically
    });

    if (response.status === 302) {
      // Get the redirect URL from the Location header
      const redirectUrl = response.headers.get('location');
      if (redirectUrl) {
        return NextResponse.redirect(redirectUrl);
      }
    }

    return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 });

  } catch (error: unknown) {
    console.error('OAuth login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}