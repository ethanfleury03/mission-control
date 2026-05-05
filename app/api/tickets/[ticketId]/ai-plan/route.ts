import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { generateTicketAIPlan, helpDeskErrorResponse } from '@/lib/help-desk/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  const { ticketId } = await context.params;

  try {
    const ticket = await generateTicketAIPlan(auth.authed, ticketId);
    return NextResponse.json({ ticket });
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
