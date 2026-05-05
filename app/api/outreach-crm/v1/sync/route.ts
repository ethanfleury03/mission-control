import { NextResponse } from 'next/server';
import { syncOutreachCrmCache } from '@/lib/outreach-crm/service';
import { serviceAuthResponse } from '../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = serviceAuthResponse(request.headers);
  if (auth) return auth;

  try {
    const result = await syncOutreachCrmCache();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'sync_failed' },
      { status: 500 },
    );
  }
}
