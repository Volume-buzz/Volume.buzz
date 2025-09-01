import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const store = await cookies();
    const session = store.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const apiBase = process.env.NEXT_PUBLIC_API_BASE!;
    const res = await fetch(`${apiBase}/api/spotify/token`, {
      headers: { Authorization: `Bearer ${session}` }
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}
