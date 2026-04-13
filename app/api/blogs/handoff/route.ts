import { NextRequest, NextResponse } from 'next/server';
import { applyBlogHandoff, extractBlogHandoffs, type BlogHandoff } from '../_lib/handoff';

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

function handoffAuthFailure(request: NextRequest): NextResponse | null {
  const secret = process.env.BLOG_HANDOFF_SECRET?.trim();
  if (!secret) return null;
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const headerSecret = request.headers.get('x-blog-handoff-secret')?.trim() || '';
  if (bearer === secret || headerSecret === secret) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function coerceBodyToHandoff(body: any): BlogHandoff | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const nested = body.handoff;
  if (nested && typeof nested === 'object') return nested as BlogHandoff;
  if (body.schema === 'handoff.blog.v1') return body as BlogHandoff;
  if (
    body.run_id &&
    (body.content_markdown || body.content_html || body.pdf_url || body.wp_url || body.wp_post_id || body.error_summary)
  ) {
    return body as BlogHandoff;
  }
  return undefined;
}

async function findItemIdByRunId(runId: string): Promise<string | null> {
  const boardRes = await fetch(`${API_BASE}/work/board?contextKey=${encodeURIComponent('blog:content')}`, { cache: 'no-store' });
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
    const denied = handoffAuthFailure(request);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const itemIdInput = String(body?.itemId || body?.work_item_id || '').trim();
    const explicit = coerceBodyToHandoff(body);
    const raw = String(body?.raw || body?.stdout || '');

    const handoffs: BlogHandoff[] = [];
    if (explicit) handoffs.push(explicit);
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
