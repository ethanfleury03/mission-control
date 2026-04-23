/**
 * Defense-in-depth helper: middleware.ts is the primary auth gate for every
 * /api/* route (it returns 401 for unauthenticated requests), but individual
 * route handlers can call requireAuth() to be explicit and to surface the
 * session data.
 *
 * Routes under /api/auth/* (NextAuth's own handlers) must NOT call this —
 * they run before a session exists.
 */

import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  getAuthBypassEmail,
  getAuthBypassHd,
  isAuthBypassEnabled,
} from '@/lib/auth/bypass';

export interface AuthedSession {
  email: string;
  hd: string | null;
}

type Allowed = { authed: AuthedSession; response?: undefined };
type Denied = { authed?: undefined; response: NextResponse };

export async function requireAuth(): Promise<Allowed | Denied> {
  if (isAuthBypassEnabled()) {
    return {
      authed: {
        email: getAuthBypassEmail(),
        hd: getAuthBypassHd(),
      },
    };
  }

  const session = await auth();
  if (!session || !session.user) {
    return {
      response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }),
    };
  }
  const email = typeof session.user.email === 'string' ? session.user.email : '';
  const hd = typeof (session as any).hd === 'string' ? (session as any).hd : null;
  if (!email.toLowerCase().endsWith('@arrsys.com')) {
    return {
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }
  return { authed: { email, hd } };
}
