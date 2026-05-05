import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import {
  archiveTicket,
  getVisibleTicket,
  helpDeskErrorResponse,
  updateTicket,
} from '@/lib/help-desk/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { ticketId } = await context.params;

  try {
    const ticket = await getVisibleTicket(auth.authed, ticketId);
    return NextResponse.json({ ticket }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { ticketId } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    const ticket = await updateTicket(auth.authed, ticketId, body);
    return NextResponse.json({ ticket });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { ticketId } = await context.params;

  try {
    await archiveTicket(auth.authed, ticketId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
