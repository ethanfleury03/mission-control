import { NextResponse } from 'next/server';
import { ingestRetellWebhook } from '@/lib/phone/service';
import { verifyRetellSignature } from '@/lib/phone/retell';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-retell-signature');
  if (!verifyRetellSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid Retell signature' }, { status: 401 });
  }

  let payload: { event?: string; call?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody) as { event?: string; call?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  try {
    const call = await ingestRetellWebhook(rawBody, payload);
    return NextResponse.json({ ok: true, callId: call.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not ingest webhook' },
      { status: 400 },
    );
  }
}
