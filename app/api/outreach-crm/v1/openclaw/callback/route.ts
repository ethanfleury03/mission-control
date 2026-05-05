import { NextResponse } from 'next/server';
import { applyOutreachOpenClawCallback, type OutreachCallbackPayload } from '@/lib/outreach-crm/service';
import { verifyArrowWebhookSignature } from '@/lib/outreach-crm/service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = verifyArrowWebhookSignature(rawBody, request.headers);
  if (!signature.ok) {
    return NextResponse.json({ error: signature.error ?? 'invalid_signature' }, { status: signature.status });
  }

  let payload: OutreachCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as OutreachCallbackPayload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const result = await applyOutreachOpenClawCallback(payload);
  return NextResponse.json(result, { status: result.ok === false ? result.status ?? 400 : 200 });
}
