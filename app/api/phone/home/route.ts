import { NextResponse } from 'next/server';
import { getPhoneHomeData } from '@/lib/phone/service';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const data = await getPhoneHomeData();
  return NextResponse.json(data);
}

export const GET = withActiveUser(GETHandler);
