import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { helpDeskErrorResponse, listDeveloperTickets } from '@/lib/help-desk/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const tickets = await listDeveloperTickets(auth.authed);
    return NextResponse.json(
      { tickets, lastUpdatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const { status, message } = helpDeskErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
