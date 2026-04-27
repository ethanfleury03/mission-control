import { auth } from '@/auth';
import { isAuthBypassEnabled } from '@/lib/auth/bypass';
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

function isReadOnlyModeEnabled(): boolean {
  return process.env.MISSION_CONTROL_READ_ONLY === '1';
}

function isMutatingApiRequest(method: string, pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (pathname === '/api/healthz' || pathname.startsWith('/api/auth/')) return false;
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (isAuthBypassEnabled()) return NextResponse.next();

  if (isReadOnlyModeEnabled() && isMutatingApiRequest(req.method, pathname)) {
    return NextResponse.json(
      { error: 'read_only', message: 'Mission Control is temporarily read-only for database maintenance.' },
      { status: 503 },
    );
  }

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
