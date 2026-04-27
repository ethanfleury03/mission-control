import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/admin';
import { ADMIN_EMAIL } from '@/lib/auth/constants';
import { getRequestAuditMeta, recordAuthEvent } from '@/lib/auth/audit-log';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const nextStatus = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!['active', 'disabled'].includes(nextStatus)) {
    return NextResponse.json({ error: 'status must be active or disabled' }, { status: 400 });
  }

  const user = await prisma.appUser.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 });
  }
  if (user.email === ADMIN_EMAIL && nextStatus === 'disabled') {
    return NextResponse.json({ error: 'primary admin cannot be disabled' }, { status: 400 });
  }

  const updated = await prisma.appUser.update({
    where: { id },
    data: {
      status: nextStatus,
      disabledAt: nextStatus === 'disabled' ? new Date() : null,
    },
  });

  await recordAuthEvent({
    type: nextStatus === 'disabled' ? 'user_disabled' : 'user_enabled',
    actorEmail: admin.authed.email,
    targetEmail: user.email,
    route: `/api/admin/users/${id}`,
    action: 'update_user_status',
    detail: { previousStatus: user.status, nextStatus },
    ...getRequestAuditMeta(request),
  });

  return NextResponse.json({ user: updated });
}
