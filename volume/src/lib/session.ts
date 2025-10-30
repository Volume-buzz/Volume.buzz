import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface SessionUser {
  userId: string;
  discordId: string;
  email: string;
  name: string;
  image: string;
  discordAccessToken?: string;
  discordRefreshToken?: string;
  discordTokenExpiresAt?: string;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie?.value) {
      return null;
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(sessionCookie.value, secret);
    
    return {
      userId: payload.userId as string,
      discordId: payload.discordId as string,
      email: payload.email as string,
      name: payload.name as string,
      image: payload.image as string,
      discordAccessToken: payload.discordAccessToken as string | undefined,
      discordRefreshToken: payload.discordRefreshToken as string | undefined,
      discordTokenExpiresAt: payload.discordTokenExpiresAt as string | undefined,
    };
  } catch (error) {
    console.error('Session verification failed:', error);
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}
