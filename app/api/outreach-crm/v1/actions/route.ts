import { NextResponse } from 'next/server';
import { createOutreachAction, type OutreachActionRequest } from '@/lib/outreach-crm/service';
import { jsonError, readJsonBody, serviceAuthResponse } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

export async function POST(request: Request) {
  const auth = serviceAuthResponse(request.headers);
  if (auth) return auth;

  const body = await readJsonBody(request);
  if (!body) return jsonError('invalid_json');
  if (typeof body.actionType !== 'string') return jsonError('actionType is required');

  const action: OutreachActionRequest = {
    actionType: body.actionType as OutreachActionRequest['actionType'],
    contactId: typeof body.contactId === 'string' ? body.contactId : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    replyThreadId: typeof body.replyThreadId === 'string' ? body.replyThreadId : undefined,
    instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
    dryRun: Boolean(body.dryRun),
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
    senderEmail: typeof body.senderEmail === 'string' ? body.senderEmail : undefined,
    ccEmails: stringArray(body.ccEmails ?? body.cc),
    signatureRequired: typeof body.signatureRequired === 'boolean' ? body.signatureRequired : undefined,
  };

  try {
    const result = await createOutreachAction(action, request.headers.get('x-arrow-actor') ?? 'service');
    return NextResponse.json(result, { status: result.ok === false ? result.status ?? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'action_failed' },
      { status: 500 },
    );
  }
}
