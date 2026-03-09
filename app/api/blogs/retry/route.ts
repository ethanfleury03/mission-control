import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { BLOG_ORCHESTRATOR_AGENT_ID } from '../_lib/agents';
import { applyBlogHandoff, extractBlogHandoffs } from '../_lib/handoff';

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
    const qualityReasons: string[] = Array.isArray(item?.metadata?.quality_reasons) ? item.metadata.quality_reasons : [];
    const qualityFixBlock = qualityReasons.length
      ? [
          'quality_fixes_required:',
          ...qualityReasons.map((r: string, i: number) => `  ${i + 1}. ${r}`),
          'Apply all quality fixes above before finalizing draft.',
        ].join('\n')
      : '';

    const prompt = [
      'Retry blog generation for existing work item.',
      `work_item_id: ${itemId}`,
      `run_id: ${runId}`,
      `title: ${item.title}`,
      `topic: ${item?.metadata?.topic || ''}`,
      `niche: ${item?.metadata?.niche || ''}`,
      `primary_keyword: ${item?.metadata?.primary_keyword || ''}`,
      `target_words: ${item?.metadata?.target_words || 1800}`,
      qualityFixBlock,
      'requirements: generate/update metadata.content_markdown and advance to Human approval wait when preview is ready. Emit final JSON handoff schema=handoff.blog.v1.',
    ].filter(Boolean).join('\n');

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
          orchestration_started_at: new Date().toISOString(),
          last_agent_update_at: new Date().toISOString(),
          retry_count: Number(item?.metadata?.retry_count || 0) + 1,
          error_summary: '',
        },
      }),
    });

    try {
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', BLOG_ORCHESTRATOR_AGENT_ID, '--message', prompt, '--json'], {
        timeout: 600000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const handoffs = extractBlogHandoffs(String(stdout || ''));
      for (const h of handoffs) await applyBlogHandoff(itemId, h as any);
      return NextResponse.json({ ok: true, itemId, dispatch: stdout, handoffsApplied: handoffs.length });
    } catch (err: any) {
      const out = String(err?.stdout || '');
      const handoffs = extractBlogHandoffs(out);
      if (handoffs.length) {
        for (const h of handoffs) await applyBlogHandoff(itemId, h as any);
        return NextResponse.json({ ok: true, itemId, dispatch: out, warning: 'non-zero exit but handoff detected', handoffsApplied: handoffs.length });
      }
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
            orchestration_status: 'failed',
            error_summary: `Retry dispatch failed: ${err?.message || 'unknown error'}`,
            next_action: 'Retry generation',
          },
        }),
      });
      return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Retry failed' }, { status: 500 });
  }
}
