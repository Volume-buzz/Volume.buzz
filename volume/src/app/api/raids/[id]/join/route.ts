/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(_req: Request, ctx: any) {
  try {
    const store = await cookies();
    const session = store.get('session')?.value;
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiBase = process.env.NEXT_PUBLIC_API_BASE!;
    const res = await fetch(`${apiBase}/api/raids/${ctx?.params?.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session}`,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Join failed' }, { status: 500 });
  }
}
