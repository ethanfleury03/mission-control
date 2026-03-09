import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { BLOG_PUBLISHER_AGENT_ID } from '../_lib/agents';

const execFileAsync = promisify(execFile);
const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export async function POST(request: NextRequest) {
  try {
    const { itemId } = await request.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const getRes = await fetch(`${API_BASE}/work/items/${itemId}`, { cache: 'no-store' });
    const item = await getRes.json();
    if (!getRes.ok) return NextResponse.json({ error: item?.error || 'Run not found' }, { status: getRes.status });

    const runId = item?.metadata?.run_id || itemId;

    await fetch(`${API_BASE}/work/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        description: item.description || null,
        status: 'ongoing',
        priority: item.priority ?? 0,
        metadata: {
          ...(item.metadata || {}),
          approval_state: 'approved',
          current_stage: 'WordPress publish handoff',
          next_action: 'Dispatching to publisher',
          publish_status: 'queued',
          error_summary: '',
        },
      }),
    });

    const prompt = [
      'Publish approved blog run and write back publish results to the same work item metadata.',
      `work_item_id: ${itemId}`,
      `run_id: ${runId}`,
      `title: ${item.title}`,
      `topic: ${item?.metadata?.topic || ''}`,
      `content_markdown: ${(item?.metadata?.content_markdown || '').slice(0, 12000)}`,
      'requirements: publish to wordpress if possible, then set metadata.current_stage to Status report back and include metadata.wp_url and metadata.wp_post_id when available. If publish fails set metadata.error_summary and metadata.next_action.',
    ].join('\n');

    try {
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', BLOG_PUBLISHER_AGENT_ID, '--message', prompt, '--json'], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });

      await fetch(`${API_BASE}/work/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          description: item.description || null,
          status: 'ongoing',
          priority: item.priority ?? 0,
          metadata: {
            ...(item.metadata || {}),
            approval_state: 'approved',
            current_stage: 'Publish result parse',
            next_action: 'Waiting for publish result write-back',
            publish_status: 'processing',
            publisher_dispatch_raw: stdout,
          },
        }),
      });

      return NextResponse.json({ ok: true, itemId });
    } catch (err: any) {
      await fetch(`${API_BASE}/work/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          description: item.description || null,
          status: 'need_human',
          priority: item.priority ?? 0,
          metadata: {
            ...(item.metadata || {}),
            current_stage: 'WordPress publish handoff',
            publish_status: 'failed',
            error_summary: `Publisher dispatch failed: ${err?.message || 'unknown error'}`,
            next_action: 'Retry publish',
          },
        }),
      });
      return NextResponse.json({ error: err?.message || 'Publisher dispatch failed' }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approve/publish failed' }, { status: 500 });
  }
}
