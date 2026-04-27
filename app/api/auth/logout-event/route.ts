import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { getRequestAuditMeta, recordAuthEvent } from '@/lib/auth/audit-log';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  await recordAuthEvent({
    type: 'logout',
    actorEmail: auth.authed.email,
    targetEmail: auth.authed.email,
    route: '/api/auth/logout-event',
    action: 'sign_out',
    ...getRequestAuditMeta(request),
  });

  return NextResponse.json({ ok: true });
}
