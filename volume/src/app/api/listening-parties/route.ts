import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const FALLBACK_BACKEND = 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendBase = process.env.BOT_API_URL || process.env.NEXT_PUBLIC_API_BASE || FALLBACK_BACKEND;
    const payload = await request.json();

    const backendResponse = await fetch(`${backendBase}/api/listening-parties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify(payload),
    });

    const resultText = await backendResponse.text();
    let result: any = null;
    try {
      result = resultText ? JSON.parse(resultText) : null;
    } catch {
      result = { error: resultText || 'Unexpected response from backend service' };
    }

    if (!backendResponse.ok) {
      return NextResponse.json(
        result || { error: 'Failed to create listening party' },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json(result, { status: backendResponse.status });
  } catch (error) {
    console.error('Failed to create listening party via backend:', error);
    return NextResponse.json({ error: 'Failed to create listening party' }, { status: 500 });
  }
}
