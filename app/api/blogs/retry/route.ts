import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { BLOG_ORCHESTRATOR_AGENT_ID } from '../_lib/agents';

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
    const prompt = [
      'Retry blog generation for existing work item.',
      `work_item_id: ${itemId}`,
      `run_id: ${runId}`,
      `title: ${item.title}`,
      `topic: ${item?.metadata?.topic || ''}`,
      `niche: ${item?.metadata?.niche || ''}`,
      `primary_keyword: ${item?.metadata?.primary_keyword || ''}`,
      `target_words: ${item?.metadata?.target_words || 1800}`,
      'requirements: generate/update metadata.content_markdown and advance to Human approval wait when preview is ready.',
    ].join('\n');

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
          current_stage: 'Content/preview generation',
          next_action: 'Retrying generation',
          orchestration_status: 'queued',
          retry_count: Number(item?.metadata?.retry_count || 0) + 1,
          error_summary: '',
        },
      }),
    });

    const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', BLOG_ORCHESTRATOR_AGENT_ID, '--message', prompt, '--json'], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });

    return NextResponse.json({ ok: true, itemId, dispatch: stdout });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: 500 });
  }
}
