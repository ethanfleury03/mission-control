import { NextResponse } from 'next/server';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function PATCHHandler() {
  return NextResponse.json(
    { error: 'Phone campaign orchestration is disabled. Calls are created in Retell.' },
    { status: 410 },
  );
}

export const PATCH = withActiveUser(PATCHHandler);
