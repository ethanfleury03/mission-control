import { NextResponse } from 'next/server';

import { collectRagHealth } from '@/lib/rag/health';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const health = await collectRagHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}

export const GET = withActiveUser(GETHandler);
