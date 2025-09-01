import { cookies } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;

export async function apiGet<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { cookie: `session=${session}`, Authorization: `Bearer ${session}` } : {})
    },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const data = (await res.json()) as T;
  return data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { cookie: `session=${session}`, Authorization: `Bearer ${session}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  const data = (await res.json()) as T;
  return data;
}
