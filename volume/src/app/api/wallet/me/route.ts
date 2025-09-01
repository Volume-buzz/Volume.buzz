import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const apiBase = process.env.NEXT_PUBLIC_API_BASE!;
    const res = await fetch(`${apiBase}/api/wallet/me`, {
      headers: { Authorization: `Bearer ${session}` }
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 });
  }
}

