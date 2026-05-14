import { NextRequest, NextResponse } from 'next/server';
import { backfillRetellHistory } from '@/lib/phone/service';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // allow empty body
  }

  try {
    const days =
      typeof body.days === 'number' && Number.isFinite(body.days) ? Math.max(1, body.days) : 30;
    return NextResponse.json(await backfillRetellHistory(days));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not backfill Retell history' },
      { status: 400 },
    );
  }
}

export const POST = POSTHandler;
