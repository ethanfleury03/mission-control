import { NextRequest, NextResponse } from 'next/server';
import { listOutreachContacts } from '@/lib/outreach-crm/service';
import { serviceAuthResponse } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = serviceAuthResponse(request.headers);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const result = await listOutreachContacts({
    q: searchParams.get('q'),
    status: searchParams.get('status'),
    cursor: searchParams.get('cursor'),
    limit: Number(searchParams.get('limit') ?? '100'),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
