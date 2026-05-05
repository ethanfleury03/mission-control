import { NextResponse } from 'next/server';

import { requireAuth } from '@/app/api/_lib/require-auth';
import { createOutreachAction, syncOutreachCrmCache } from '@/lib/outreach-crm/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

function deepSyncEnabled(): boolean {
  const value = process.env.OUTREACH_CRM_DEEP_SYNC_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const mode = typeof body?.mode === 'string' ? body.mode : 'deep';

  try {
    if (mode === 'hubspot') {
      const sync = await syncOutreachCrmCache();
      return NextResponse.json({ ok: true, mode, status: 'completed', dashboard: sync.dashboard });
    }

    if (!deepSyncEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          mode: 'deep',
          status: 'unavailable',
          error: 'Deep Sync is only available in production.',
        },
        { status: 503 },
      );
    }

    const result = await createOutreachAction(
      {
        actionType: 'deep_sync',
        instructions: 'Read-only dashboard deep sync requested from Outreach CRM UI.',
      },
      auth.authed.email,
    );
    const job = (result as any).job;
    return NextResponse.json({
      ok: result.ok !== false,
      mode: 'deep',
      jobId: job?.jobId ?? job?.id ?? null,
      status: job?.status ?? ((result as any).status ? 'failed' : 'unknown'),
      dashboard: (result as any).activityMerge?.dashboard ?? (result as any).result?.dashboard ?? null,
      error: (result as any).error,
    }, { status: result.ok === false ? (result.status ?? 500) : 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, mode, status: 'failed', error: error instanceof Error ? error.message : 'sync_failed' },
      { status: 500 },
    );
  }
}
