import { NextResponse } from 'next/server';
import { getPhoneLists } from '@/lib/phone/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json(await getPhoneLists());
}

async function POSTHandler() {
  return NextResponse.json(
    { error: 'Phone list management is disabled. Lists live in the CRM.' },
    { status: 410 },
  );
}

export const GET = withActiveUser(GETHandler);
export const POST = withActiveUser(POSTHandler);
