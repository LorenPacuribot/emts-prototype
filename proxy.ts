/*
  Server-side sign-in check. Every staff page needs a valid, signed session
  cookie (lib/auth/session-token.ts); without one the request is redirected
  to /login before any page code is sent. Customer links, the website form
  and the API routes stay public (features/lib/auth/auth.ts › isPublicPath).
*/
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath, SESSION_COOKIE } from '@/features/lib/auth/auth';
import { authSecret, verifySession } from '@/lib/auth/session-token';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value, authSecret());
  if (session) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and files with an extension (images, icons, fonts).
  matcher: ['/((?!api|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
