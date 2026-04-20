import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/signin',
  '/healthz',
  '/favicon.ico',
  '/api/healthz',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff2?|ttf|css|js|map)$/i)) return true;
  return false;
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (!req.auth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const signInUrl = new URL('/signin', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', pathname + search);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  // Exclude /healthz from middleware so the route always serves (avoids 404 on
  // some hosts when auth edge runs first; bootstrap and probes use this path).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|healthz|api/healthz).*)'],
};
