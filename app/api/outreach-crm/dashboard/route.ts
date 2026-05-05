import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { getOutreachDashboardWithCacheFallback } from '@/lib/outreach-crm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const dashboard = await getOutreachDashboardWithCacheFallback();
    return NextResponse.json(dashboard, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Outreach CRM dashboard.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
