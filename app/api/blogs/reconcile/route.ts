import { NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';
const BLOG_CONTEXT = 'blog:content';

type WorkItem = {
  id: string;
  title: string;
  description: string | null;
  status: 'queue' | 'ongoing' | 'need_human' | 'completed';
  priority: number;
  metadata: Record<string, any>;
};

function hasDraft(item: WorkItem) {
  return Boolean(item.metadata?.content_markdown || item.metadata?.content_html);
}

function hasPublishResult(item: WorkItem) {
  return Boolean(item.metadata?.wp_url || item.metadata?.wp_post_id);
}

async function patchItem(item: WorkItem, metadataPatch: Record<string, any>, status?: WorkItem['status']) {
  await fetch(`${API_BASE}/work/items/${item.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      description: item.description || null,
      status: status || item.status,
      priority: item.priority ?? 0,
      metadata: { ...(item.metadata || {}), ...metadataPatch },
    }),
  });
}

export async function POST() {
  try {
    const boardRes = await fetch(`${API_BASE}/work/board?contextKey=${encodeURIComponent(BLOG_CONTEXT)}`, { cache: 'no-store' });
    const board = await boardRes.json();
    if (!boardRes.ok) return NextResponse.json({ error: board?.error || 'Failed to load board' }, { status: boardRes.status });

    const items: WorkItem[] = [];
    for (const col of board.columns || []) for (const item of col.items || []) items.push(item);

    let updated = 0;
    for (const item of items) {
      const stage = String(item.metadata?.current_stage || '');

      if (stage === 'Content/preview generation' && hasDraft(item)) {
        await patchItem(item, {
          current_stage: 'Human approval wait',
          next_action: 'Awaiting human decision',
          orchestration_status: 'ready_for_review',
        }, 'need_human');
        updated += 1;
        continue;
      }

      if ((stage === 'WordPress publish handoff' || stage === 'Publish result parse') && hasPublishResult(item)) {
        await patchItem(item, {
          current_stage: 'Status report back',
          next_action: 'Published successfully',
          publish_status: 'success',
          error_summary: '',
        }, 'completed');
        updated += 1;
        continue;
      }

      if ((stage === 'WordPress publish handoff' || stage === 'Publish result parse') && item.metadata?.error_summary) {
        await patchItem(item, {
          next_action: 'Retry publish',
          publish_status: 'failed',
        }, 'need_human');
        updated += 1;
      }
    }

    return NextResponse.json({ ok: true, scanned: items.length, updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reconcile failed' }, { status: 500 });
  }
}
