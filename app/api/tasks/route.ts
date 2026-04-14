import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';
import { isOpenClawDisabledForRequest } from '../_lib/is-openclaw-disabled';

type BoardItem = {
  id: string;
  title: string;
  description?: string | null;
  status: 'queue' | 'ongoing' | 'need_human' | 'completed';
  priority?: number;
  agentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type BoardResponse = {
  columns: Array<{ id: string; items: BoardItem[] }>;
};

function mapPriority(n?: number): 'low' | 'medium' | 'high' {
  if (typeof n !== 'number') return 'medium';
  if (n >= 8) return 'high';
  if (n <= 3) return 'low';
  return 'medium';
}

export async function GET() {
  if (await isOpenClawDisabledForRequest()) return NextResponse.json([]);
  try {
    const board = await fetchBackend<BoardResponse>('/work/board');
    const items = (board.columns ?? []).flatMap((c) => c.items ?? []);

    const tasks = items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      status: item.status,
      priority: mapPriority(item.priority),
      assigned_to: item.agentId ?? undefined,
      created_by: 'system',
      created_at: item.createdAt ?? new Date().toISOString(),
      updated_at: item.updatedAt ?? new Date().toISOString(),
      source: 'manual' as const,
      metadata: {}
    }));

    return NextResponse.json(tasks);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
