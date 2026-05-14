import { NextResponse } from 'next/server';
import { getPhoneCampaigns } from '@/lib/phone/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json(await getPhoneCampaigns());
}

async function POSTHandler() {
  return NextResponse.json(
    { error: 'Phone campaign orchestration is disabled. Calls are created in Retell.' },
    { status: 410 },
  );
}

export const GET = withActiveUser(GETHandler);
export const POST = withActiveUser(POSTHandler);
