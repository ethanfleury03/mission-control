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
  appUserId: string | null;
  email: string;
  hd: string | null;
  role: string | null;
  status: string | null;
}

type Allowed = { authed: AuthedSession; response?: undefined };
type Denied = { authed?: undefined; response: NextResponse };

export async function requireAuth(): Promise<Allowed | Denied> {
  if (isAuthBypassEnabled()) {
    return {
      authed: {
        appUserId: null,
        email: getAuthBypassEmail(),
        hd: getAuthBypassHd(),
        role: 'admin',
        status: 'active',
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
  const hd = typeof session.hd === 'string' ? session.hd : null;
  const appUserId = typeof session.appUserId === 'string' ? session.appUserId : null;
  let role = typeof session.appRole === 'string' ? session.appRole : null;
  let status = typeof session.appStatus === 'string' ? session.appStatus : null;
  if (!email.toLowerCase().endsWith('@arrsys.com')) {
    return {
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  let resolvedAppUserId = appUserId;
  try {
    const { prisma } = await import('@/lib/prisma');
    const appUser = appUserId
      ? await prisma.appUser.findUnique({ where: { id: appUserId } })
      : await prisma.appUser.findUnique({ where: { email: email.toLowerCase() } });
    if (appUser?.status === 'disabled') {
      const { recordAuthEvent } = await import('@/lib/auth/audit-log');
      await recordAuthEvent({
        type: 'api_rejected_disabled',
        actorEmail: appUser.email,
        targetEmail: appUser.email,
        action: 'require_auth',
      });
      return {
        response: NextResponse.json({ error: 'account_disabled' }, { status: 403 }),
      };
    }

    if (appUser) {
      resolvedAppUserId = appUser.id;
      role = appUser.role;
      status = appUser.status;
      const stale =
        !appUser.lastSeenAt || Date.now() - appUser.lastSeenAt.getTime() > 5 * 60 * 1000;
      if (stale) {
        await prisma.appUser.update({
          where: { id: appUser.id },
          data: { lastSeenAt: new Date() },
        });
      }
    }
  } catch (error) {
    console.warn('App user session metadata lookup failed', error);
  }

  return { authed: { appUserId: resolvedAppUserId, email, hd, role, status } };
}
