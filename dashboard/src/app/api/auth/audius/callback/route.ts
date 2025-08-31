import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token, state } = await request.json();

    if (!token || !state) {
      return NextResponse.json({
        success: false,
        error: 'Missing token or state parameter'
      }, { status: 400 });
    }

    // Forward to your main API server
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    
    const response = await fetch(`${backendUrl}/auth/audius/callback?token=${encodeURIComponent(token)}&state=${state}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OAuth-Frontend/1.0'
      }
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: 'Audius account connected successfully',
        user: null // Could parse user info from JWT token if needed
      });
    } else {
      const errorText = await response.text();
      return NextResponse.json({
        success: false,
        error: `Backend error: ${response.status} - ${errorText}`
      }, { status: response.status });
    }

  } catch (error: unknown) {
    console.error('Audius callback API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}