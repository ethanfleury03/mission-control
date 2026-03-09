import { NextResponse } from 'next/server';
import { getOpenClawStatus } from '../_lib/openclaw';

export async function GET() {
  const status = await getOpenClawStatus();
  const heartbeat = status?.heartbeat?.agents ?? [];

  const now = Date.now();
  const crons = heartbeat.map((h) => ({
    id: `hb-${h.agentId}`,
    name: `${h.agentId} heartbeat`,
    enabled: !!h.enabled,
    schedule: h.every || (h.enabled ? 'enabled' : 'disabled'),
    lastRun: new Date(now - 60_000).toISOString(),
    nextRun: new Date(now + 60_000).toISOString(),
    status: h.enabled ? 'healthy' : 'warning',
  }));

  return NextResponse.json(crons);
}
