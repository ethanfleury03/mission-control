import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { BLOG_WRITER_AGENT_ID } from '../_lib/agents';
import { applyBlogHandoff, extractBlogHandoffs, extractPreviewUrl, fetchPreviewAsMarkdown } from '../_lib/handoff';
import {
  buildBlogHandoffCallbackUrl,
  isN8nBlogPipelineEnabled,
  n8nApiBaseForPayload,
  postN8nBlogWebhook,
} from '../_lib/n8n';

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
    const useN8n = isN8nBlogPipelineEnabled();
    const retryCount = Number(item?.metadata?.retry_count || 0) + 1;
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
          next_action: useN8n ? 'Retrying n8n workflow' : 'Retrying generation',
          orchestration_status: 'queued',
          orchestration_started_at: new Date().toISOString(),
          last_agent_update_at: new Date().toISOString(),
          retry_count: retryCount,
          error_summary: '',
          blog_pipeline: useN8n ? 'n8n' : item.metadata?.blog_pipeline || 'openclaw',
        },
      }),
    });

    if (useN8n) {
      const webhook = await postN8nBlogWebhook({
        event: 'blog_run_retry',
        work_item_id: itemId,
        run_id: String(runId),
        title: item.title,
        topic: String(item?.metadata?.topic || ''),
        niche: String(item?.metadata?.niche || ''),
        primary_keyword: String(item?.metadata?.primary_keyword || ''),
        target_words: Number(item?.metadata?.target_words || 1800),
        callback_url: buildBlogHandoffCallbackUrl(),
        api_base: n8nApiBaseForPayload(),
        handoff_secret_configured: Boolean(process.env.BLOG_HANDOFF_SECRET?.trim()),
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
            retry_count: retryCount,
            orchestration_status: webhook.ok ? 'n8n_triggered' : 'failed',
            last_agent_update_at: new Date().toISOString(),
            next_action: webhook.ok ? 'n8n workflow running' : 'n8n webhook failed — check logs and retry',
            ...(webhook.ok
              ? { error_summary: '' }
              : {
                  error_summary: `n8n webhook HTTP ${webhook.status}: ${webhook.body.slice(0, 400)}`,
                }),
          },
        }),
      }).catch(() => null);

      if (!webhook.ok) {
        return NextResponse.json(
          { error: `n8n webhook failed (${webhook.status})`, webhook: { status: webhook.status, body: webhook.body } },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, itemId, dispatch: { n8n: true } });
    }

    try {
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', BLOG_WRITER_AGENT_ID, '--message', prompt, '--json'], {
        timeout: 600000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const out = String(stdout || '');
      const handoffs = extractBlogHandoffs(out);
      for (const h of handoffs) await applyBlogHandoff(itemId, h as any);

      if (!handoffs.length) {
        const previewUrl = extractPreviewUrl(out);
        if (previewUrl) {
          const markdown = await fetchPreviewAsMarkdown(previewUrl);
          if (markdown) {
            await applyBlogHandoff(itemId, {
              schema: 'handoff.blog.v1',
              run_id: runId,
              work_item_id: itemId,
              stage: 'Human approval wait',
              status: 'ready_for_review',
              content_markdown: markdown,
              metadata: { preview_url: previewUrl },
            });
            return NextResponse.json({ ok: true, itemId, dispatch: stdout, handoffsApplied: 1, fallbackFromPreview: true });
          }
        }
      }

      return NextResponse.json({ ok: true, itemId, dispatch: stdout, handoffsApplied: handoffs.length });
    } catch (err: any) {
      const out = String(err?.stdout || '');
      const handoffs = extractBlogHandoffs(out);
      if (handoffs.length) {
        for (const h of handoffs) await applyBlogHandoff(itemId, h as any);
        return NextResponse.json({ ok: true, itemId, dispatch: out, warning: 'non-zero exit but handoff detected', handoffsApplied: handoffs.length });
      }

      const previewUrl = extractPreviewUrl(out);
      if (previewUrl) {
        const markdown = await fetchPreviewAsMarkdown(previewUrl);
        if (markdown) {
          await applyBlogHandoff(itemId, {
            schema: 'handoff.blog.v1',
            run_id: runId,
            work_item_id: itemId,
            stage: 'Human approval wait',
            status: 'ready_for_review',
            content_markdown: markdown,
            metadata: { preview_url: previewUrl },
          });
          return NextResponse.json({ ok: true, itemId, dispatch: out, warning: 'non-zero exit but preview fallback used', handoffsApplied: 1, fallbackFromPreview: true });
        }
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
