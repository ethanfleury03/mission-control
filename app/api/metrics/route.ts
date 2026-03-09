import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';
import { getOpenClawStatus } from '../_lib/openclaw';

type BoardResponse = {
  counts?: {
    queue?: number;
    ongoing?: number;
    need_human?: number;
    completed?: number;
    total?: number;
  };
};

export async function GET() {
  try {
    const [board, status] = await Promise.all([
      fetchBackend<BoardResponse>('/work/board'),
      getOpenClawStatus(),
    ]);

    const counts = board.counts ?? {};
    const queue = counts.queue ?? 0;
    const ongoing = counts.ongoing ?? 0;
    const needHuman = counts.need_human ?? 0;
    const completed = counts.completed ?? 0;

    const sessionsRecent = status?.sessions?.recent ?? [];
    const totalSessions = status?.sessions?.count ?? sessionsRecent.length;
    const activeSessions = sessionsRecent.filter((s) => (Date.now() - (s.updatedAt ?? 0)) < 30 * 60 * 1000).length;

    const agents = status?.agents?.agents ?? [];
    const agentsOnline = agents.filter((a) => (a.lastActiveAgeMs ?? Infinity) < 30 * 60 * 1000).length;
    const agentsIdle = Math.max(0, agents.length - agentsOnline);

    const activityPerMin = Math.round(sessionsRecent.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0) / 60);
    const errors60m = status?.securityAudit?.summary?.critical ?? 0;

    const hb = status?.heartbeat?.agents ?? [];
    const overdueCrons = hb.filter((h) => !h.enabled).length;

    const wipTasks = queue + ongoing + needHuman;
    const blockedTasks = needHuman;
    const tokensTotal = sessionsRecent.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);

    const healthIndex = Math.max(
      0,
      Math.min(100, 100 - blockedTasks * 8 - errors60m * 8 - overdueCrons * 3 + Math.min(10, completed))
    );

    return NextResponse.json({
      activeSessions,
      totalSessions,
      agentsOnline,
      agentsIdle,
      activityPerMin,
      errors60m,
      overdueCrons,
      wipTasks,
      blockedTasks,
      avgDoneTime: completed > 0 ? 'active' : 'n/a',
      healthIndex,
      tokensTotal,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
