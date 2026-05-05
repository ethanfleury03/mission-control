import { NextResponse } from 'next/server';
import { getOutreachJob } from '@/lib/outreach-crm/service';
import { serviceAuthResponse } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = serviceAuthResponse(request.headers);
  if (auth) return auth;

  const { id } = await context.params;
  const job = await getOutreachJob(id);
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(job, { headers: { 'Cache-Control': 'no-store' } });
}
