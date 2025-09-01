import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
  }
}

export async function GET() {
  try {
    await clearSession();
    return NextResponse.redirect(`${process.env.APP_URL}/login`);
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.redirect(`${process.env.APP_URL}/login?error=logout_failed`);
  }
}
