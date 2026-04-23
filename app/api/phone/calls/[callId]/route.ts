import { NextRequest, NextResponse } from 'next/server';
import { getPhoneCallById } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ callId: string }> },
) {
  const { callId } = await context.params;
  const call = await getPhoneCallById(callId);
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(call);
}
