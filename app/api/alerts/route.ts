import { NextResponse } from 'next/server';
import { getOpenClawStatus } from '../_lib/openclaw';

export async function GET() {
  const status = await getOpenClawStatus();
  const summary = status?.securityAudit?.summary;

  const alerts = [
    {
      id: 'sec-critical',
      type: 'security',
      message: `${summary?.critical ?? 0} critical findings`,
      severity: (summary?.critical ?? 0) > 0 ? 'error' : 'info',
      timestamp: new Date().toISOString(),
      acknowledged: false,
    },
    {
      id: 'sec-warn',
      type: 'security',
      message: `${summary?.warn ?? 0} warnings`,
      severity: (summary?.warn ?? 0) > 0 ? 'warning' : 'info',
      timestamp: new Date().toISOString(),
      acknowledged: false,
    },
    {
      id: 'events',
      type: 'events',
      message: `${status?.queuedSystemEvents?.length ?? 0} queued system events`,
      severity: (status?.queuedSystemEvents?.length ?? 0) > 0 ? 'warning' : 'info',
      timestamp: new Date().toISOString(),
      acknowledged: false,
    },
  ];

  return NextResponse.json(alerts);
}
