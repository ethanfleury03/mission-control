import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import {
  addTicketComment,
  helpDeskErrorResponse,
  listTicketComments,
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
    const comments = await listTicketComments(auth.authed, ticketId);
    return NextResponse.json({ comments }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { ticketId } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    const ticket = await addTicketComment(auth.authed, ticketId, body);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
