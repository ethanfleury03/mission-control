import { NextResponse } from 'next/server';
import { hubspotPortalId, hubspotPushDisabled } from '@/lib/hubspot/config';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public config for client UI (token never exposed). */
async function GETHandler() {
  const portalId = hubspotPortalId();
  return NextResponse.json({
    pushDisabled: hubspotPushDisabled(),
    portalConfigured: Boolean(portalId),
    portalId: portalId ?? null,
  });
}

export const GET = withActiveUser(GETHandler);
