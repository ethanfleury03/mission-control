import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { getRequestAuditMeta, recordAuthEvent } from '@/lib/auth/audit-log';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const meta = getRequestAuditMeta(request);
  const email = auth.authed.email.trim().toLowerCase();
  const appUser = auth.authed.appUserId
    ? await prisma.appUser.findUnique({ where: { id: auth.authed.appUserId } })
    : await prisma.appUser.findUnique({ where: { email } });

  if (!appUser) {
    await recordAuthEvent({
      type: 'session_missing_user',
      actorEmail: email,
      targetEmail: email,
      route: '/api/auth/session-event',
      action: 'session_seen',
      detail: { sessionAppUserId: auth.authed.appUserId },
      ...meta,
    });
    return NextResponse.json({ error: 'user_not_found' }, { status: 403 });
  }

  if (appUser.status === 'disabled') {
    await recordAuthEvent({
      type: 'session_rejected_disabled',
      actorEmail: appUser.email,
      targetEmail: appUser.email,
      route: '/api/auth/session-event',
      action: 'session_seen',
      detail: { appUserId: appUser.id },
      ...meta,
    });
    return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
  }

  const now = new Date();
  const lastSeenAt = appUser.lastSeenAt;
  const shouldAuditSeen = !lastSeenAt || now.getTime() - lastSeenAt.getTime() > 30 * 60 * 1000;
  const shouldSetLoginMeta =
    !appUser.lastLoginIp ||
    !appUser.lastUserAgent ||
    now.getTime() - appUser.lastLoginAt.getTime() < 5 * 60 * 1000;

  const updated = await prisma.appUser.update({
    where: { id: appUser.id },
    data: {
      lastSeenAt: now,
      ...(shouldSetLoginMeta
        ? {
            lastLoginIp: meta.ip || appUser.lastLoginIp,
            lastUserAgent: meta.userAgent || appUser.lastUserAgent,
          }
        : {}),
    },
  });

  if (shouldAuditSeen) {
    await recordAuthEvent({
      type: 'session_seen',
      actorEmail: updated.email,
      targetEmail: updated.email,
      route: '/api/auth/session-event',
      action: 'session_seen',
      detail: { appUserId: updated.id, role: updated.role, status: updated.status },
      ...meta,
    });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt,
    },
  });
}
