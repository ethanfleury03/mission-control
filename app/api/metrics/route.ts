import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';

type Agent = { id: string; status?: string; tokensUsed?: number };
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
    const [agentsData, board] = await Promise.all([
      fetchBackend<{ agents?: Agent[] }>('/api/agents'),
      fetchBackend<BoardResponse>('/work/board')
    ]);

    const agents = agentsData.agents ?? [];
    const counts = board.counts ?? {};

    const queue = counts.queue ?? 0;
    const ongoing = counts.ongoing ?? 0;
    const needHuman = counts.need_human ?? 0;
    const completed = counts.completed ?? 0;

    const agentsOnline = agents.filter((a) => ['active', 'working'].includes((a.status ?? '').toLowerCase())).length;
    const agentsIdle = agents.filter((a) => (a.status ?? '').toLowerCase() === 'idle').length;
    const activeSessions = ongoing;
    const totalSessions = counts.total ?? queue + ongoing + needHuman + completed;
    const activityPerMin = ongoing + needHuman;
    const wipTasks = queue + ongoing + needHuman;
    const blockedTasks = needHuman;
    const errors60m = 0;
    const overdueCrons = 0;
    const tokensTotal = agents.reduce((sum, a) => sum + (a.tokensUsed ?? 0), 0);

    const healthIndex = Math.max(
      0,
      Math.min(100, 100 - blockedTasks * 8 - errors60m * 5 - overdueCrons * 4 + Math.min(10, completed))
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
      tokensTotal
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
