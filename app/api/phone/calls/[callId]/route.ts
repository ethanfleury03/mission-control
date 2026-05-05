import { NextRequest, NextResponse } from 'next/server';
import { getPhoneCallById } from '@/lib/phone/service';
import { withActiveUser } from '../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(
  _request: NextRequest,
  context: { params: Promise<{ callId: string }> },
) {
  const { callId } = await context.params;
  const call = await getPhoneCallById(callId);
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(call);
}

export const GET = withActiveUser(GETHandler);
