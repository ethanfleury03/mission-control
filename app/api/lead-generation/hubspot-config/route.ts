import { NextResponse } from 'next/server';
import { hubspotPortalId, hubspotPushDisabled } from '@/lib/hubspot/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public config for client UI (token never exposed). */
export async function GET() {
  const portalId = hubspotPortalId();
  return NextResponse.json({
    pushDisabled: hubspotPushDisabled(),
    portalConfigured: Boolean(portalId),
    portalId: portalId ?? null,
  });
}
