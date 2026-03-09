import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';

type Agent = { id: string; name: string; model?: string; status?: string };
type BoardItem = { id: string; status: string; agentId?: string | null; updatedAt?: string };
type BoardResponse = { columns: Array<{ id: string; items: BoardItem[] }> };

export async function GET() {
  try {
    const [agentsData, board] = await Promise.all([
      fetchBackend<{ agents?: Agent[] }>('/api/agents'),
      fetchBackend<BoardResponse>('/work/board')
    ]);

    const agents = agentsData.agents ?? [];
    const byId = new Map(agents.map((a) => [a.id, a]));
    const ongoing = (board.columns ?? []).flatMap((c) => c.items ?? []).filter((i) => i.status === 'ongoing');

    const sessions = ongoing.map((item) => {
      const a = item.agentId ? byId.get(item.agentId) : undefined;
      return {
        id: `sess-${item.id}`,
        agentId: item.agentId ?? 'unassigned',
        agentName: a?.name ?? 'Unassigned',
        model: a?.model ?? 'unknown',
        tokens: 0,
        startTime: item.updatedAt ?? new Date().toISOString(),
        lastActivity: item.updatedAt ?? new Date().toISOString(),
        status: 'active' as const
      };
    });

    return NextResponse.json(sessions);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
