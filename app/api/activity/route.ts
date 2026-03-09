import { NextResponse } from 'next/server';
import { fetchBackend } from '../_lib/backend';

type BoardItem = { status: 'queue' | 'ongoing' | 'need_human' | 'completed' };
type BoardResponse = { columns: Array<{ id: string; items: BoardItem[] }> };

export async function GET() {
  try {
    const board = await fetchBackend<BoardResponse>('/work/board');
    const items = (board.columns ?? []).flatMap((c) => c.items ?? []);
    const ongoing = items.filter((i) => i.status === 'ongoing').length;
    const needHuman = items.filter((i) => i.status === 'need_human').length;

    const now = Date.now();
    const points = Array.from({ length: 12 }).map((_, idx) => {
      const t = new Date(now - (11 - idx) * 5 * 60 * 1000);
      return {
        timestamp: t.toISOString(),
        tokens: Math.max(0, ongoing * 120 + needHuman * 40),
        sessions: ongoing
      };
    });

    return NextResponse.json(points);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
