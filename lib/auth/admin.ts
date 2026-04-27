import { NextResponse } from 'next/server';

import { requireAuth, type AuthedSession } from '@/app/api/_lib/require-auth';
import { isAdminEmail } from './constants';

type AdminAllowed = { authed: AuthedSession; response?: undefined };
type AdminDenied = { authed?: undefined; response: NextResponse };

export async function requireAdmin(): Promise<AdminAllowed | AdminDenied> {
  const authResult = await requireAuth();
  if (authResult.response) return authResult;

  if (!isAdminEmail(authResult.authed.email)) {
    const { recordAuthEvent } = await import('./audit-log');
    await recordAuthEvent({
      type: 'admin_denied',
      actorEmail: authResult.authed.email,
      action: 'require_admin',
      detail: { reason: 'not_admin' },
    });
    return {
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return { authed: authResult.authed };
}
