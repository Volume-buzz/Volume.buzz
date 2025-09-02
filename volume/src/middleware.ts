import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Redirect authenticated users away from login page
  if (path === '/login') {
    const session = request.cookies.get('session')?.value;
    if (session) {
      try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
        await jwtVerify(session, secret);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch {
        // Invalid session, let them access login page
      }
    }
  }

  // Only protect dashboard routes
  if (path.startsWith('/dashboard')) {
    const session = request.cookies.get('session')?.value;

    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
      await jwtVerify(session, secret);
      
      // Session is valid, continue
      return NextResponse.next();
    } catch {
      // Session is invalid, redirect to login
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('session');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login']
};