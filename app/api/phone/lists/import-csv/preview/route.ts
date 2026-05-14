import { NextResponse } from 'next/server';
import { withActiveUser } from '../../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(_request: Request) {
  return NextResponse.json(
    { error: 'Phone CSV import is disabled. Lists live in the CRM.' },
    { status: 410 },
  );
}

export const POST = withActiveUser(POSTHandler);
