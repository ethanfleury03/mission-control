import { NextRequest, NextResponse } from 'next/server';
import { getPhoneSettingsResponse } from '@/lib/phone/service';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  return NextResponse.json(await getPhoneSettingsResponse());
}

async function PATCHHandler(_request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  return NextResponse.json(
    { error: 'Phone settings are read-only. Retell owns calling configuration.' },
    { status: 410 },
  );
}

export const GET = GETHandler;
export const PATCH = PATCHHandler;
