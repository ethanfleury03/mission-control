import { NextRequest, NextResponse } from 'next/server';
import { applyBlogHandoff, extractBlogHandoffs, type BlogHandoff } from '../_lib/handoff';
import { backendFetch } from '../../_lib/backend';

async function findItemIdByRunId(runId: string): Promise<string | null> {
  const boardRes = await backendFetch(`/work/board?contextKey=${encodeURIComponent('blog:content')}`, { cache: 'no-store' });
  const board = await boardRes.json();
  if (!boardRes.ok) return null;
  for (const col of board.columns || []) {
    for (const item of col.items || []) {
      if (String(item?.metadata?.run_id || '') === runId) return item.id;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemIdInput = String(body?.itemId || body?.work_item_id || '').trim();
    const explicit = body?.handoff as BlogHandoff | undefined;
    const raw = String(body?.raw || body?.stdout || '');

    const handoffs: BlogHandoff[] = [];
    if (explicit && typeof explicit === 'object') handoffs.push(explicit);
    if (raw) handoffs.push(...extractBlogHandoffs(raw));

    if (!handoffs.length) {
      return NextResponse.json({ error: 'No handoff payload found' }, { status: 400 });
    }

    const results = [] as any[];
    for (const h of handoffs) {
      const resolvedItemId = itemIdInput || (h.work_item_id ? String(h.work_item_id) : '') || (h.run_id ? (await findItemIdByRunId(String(h.run_id))) || '' : '');
      if (!resolvedItemId) {
        results.push({ applied: false, error: 'Unable to resolve itemId', run_id: h.run_id || null });
        continue;
      }
      try {
        const r = await applyBlogHandoff(resolvedItemId, h);
        results.push({ itemId: resolvedItemId, run_id: h.run_id || null, ...r });
      } catch (e: any) {
        results.push({ itemId: resolvedItemId, run_id: h.run_id || null, applied: false, error: e?.message || 'apply failed' });
      }
    }

    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'handoff apply failed' }, { status: 500 });
  }
}
