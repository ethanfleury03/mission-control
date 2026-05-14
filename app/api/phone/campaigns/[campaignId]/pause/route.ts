import { NextRequest, NextResponse } from 'next/server';
import { withActiveUser } from '../../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(
  _request: NextRequest,
  _context: { params: Promise<{ campaignId: string }> },
) {
  return NextResponse.json(
    { error: 'Phone campaign orchestration is disabled. Calls are created in Retell.' },
    { status: 410 },
  );
}

export const POST = withActiveUser(POSTHandler);
