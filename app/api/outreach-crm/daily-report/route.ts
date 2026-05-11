import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { generateOutreachDailyReport, getOutreachDashboardWithCacheFallback } from '@/lib/outreach-crm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const dashboard = await getOutreachDashboardWithCacheFallback();
    return new NextResponse(generateOutreachDailyReport(dashboard), {
      headers: {
        'Cache-Control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate Outreach CRM daily report.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
