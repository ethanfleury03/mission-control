import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { createTicket, helpDeskErrorResponse, listVisibleTickets } from '@/lib/help-desk/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const tickets = await listVisibleTickets(auth.authed);
    return NextResponse.json(
      { tickets, lastUpdatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const ticket = await createTicket(auth.authed, body);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
