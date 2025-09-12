import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Checking user authentication...');
    const cookieStore = await cookies();
    
    // Debug: list all cookies
    const allCookies = cookieStore.getAll();
    console.log('🍪 All cookies:', allCookies.map(c => c.name));
    
    const userCookie = cookieStore.get('spotify_user')?.value;
    const accessToken = cookieStore.get('spotify_access_token')?.value;

    console.log('🍪 User cookie present:', !!userCookie);
    console.log('🍪 Access token present:', !!accessToken);

    if (!userCookie || !accessToken) {
      console.log('❌ Missing authentication cookies');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = JSON.parse(userCookie);
    console.log('✅ User authenticated:', user.display_name, '- Premium:', user.product === 'premium');
    
    return NextResponse.json({
      user,
      connected: true,
      premium: user.product === 'premium'
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user info' }, { status: 500 });
  }
}