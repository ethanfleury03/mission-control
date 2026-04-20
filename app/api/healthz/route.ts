import { NextResponse } from 'next/server';

/**
 * Public liveness (no auth). Use this for bootstrap / probes — `/healthz` (page) can
 * 404 in some edge/standalone cases; the API route is served by Node and is stable.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true, service: 'mc-web' });
}
