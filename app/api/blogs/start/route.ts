import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { BLOG_ORCHESTRATOR_AGENT_ID, BLOG_PUBLISHER_AGENT_ID, BLOG_WRITER_AGENT_ID } from '../_lib/agents';
import { applyBlogHandoff, extractBlogHandoffs, extractPreviewUrl, fetchPreviewAsMarkdown } from '../_lib/handoff';

const execFileAsync = promisify(execFile);

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:3001';

const BLOG_CONTEXT = 'blog:content';

const FALLBACK_TOPICS = [
  'How to reduce print downtime in production environments',
  'Top workflow bottlenecks in large format print shops',
  'Choosing the right RIP strategy for faster throughput',
  'Common prepress mistakes and how to avoid them',
  'How manufacturers can improve label quality consistency',
];

async function getAvailableAgentIds(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('openclaw', ['status', '--json'], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout || '{}');
    return (parsed?.agents?.agents || []).map((a: any) => a?.id).filter(Boolean);
  } catch {
    return [];
  }
}

function inferBlogDraft(input: any) {
  const seed = [input?.title, input?.topic, input?.niche, input?.primary_keyword].find((v: any) => typeof v === 'string' && v.trim()) || '';
  const fallbackTopic = FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
  const topic = (input?.topic || '').trim() || seed || fallbackTopic;
  const niche = (input?.niche || '').trim() || topic.split(' ')[0]?.replace(/[^a-zA-Z0-9-]/g, '') || 'industry';
  const primaryKeyword = (input?.primary_keyword || '').trim() || topic.toLowerCase().split(' ').slice(0, 3).join(' ');
  const title = (input?.title || '').trim() || `${topic.replace(/\.$/, '')}: Practical Guide for 2026`;
  return { title, topic, niche, primaryKeyword };
}

function dispatchOrchestratorAsync(params: {
  item: any;
  runId: string;
  inferred: { title: string; topic: string; niche: string; primaryKeyword: string };
  targetWords: number;
}) {
  const { item, runId, inferred, targetWords } = params;

  fetch(`${API_BASE}/work/items/${item.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: item.title,
      description: item.description || null,
      status: item.status,
      priority: item.priority ?? 0,
      metadata: {
        ...(item.metadata || {}),
        orchestration_status: 'processing',
        last_agent_update_at: new Date().toISOString(),
        next_action: 'Orchestrator running',
      },
    }),
  }).catch(() => null);
  const orchestrationPrompt = [
    `Start a blog generation run and update work item metadata for context ${BLOG_CONTEXT}.`,
    `run_id: ${runId}`,
    `work_item_id: ${item.id}`,
    `title: ${inferred.title}`,
    `topic: ${inferred.topic}`,
    `niche: ${inferred.niche}`,
    `primary_keyword: ${inferred.primaryKeyword}`,
    `target_words: ${targetWords}`,
    `requirements: produce draft markdown, and store it as metadata.content_markdown and/or metadata.content_html. Set metadata.current_stage to Human approval wait when draft preview is ready. Emit a final JSON handoff with schema=handoff.blog.v1.`,
  ].join('\n');

  execFile('openclaw', ['agent', '--agent', BLOG_ORCHESTRATOR_AGENT_ID, '--message', orchestrationPrompt, '--json'], { timeout: 600000, maxBuffer: 4 * 1024 * 1024 }, async (err, stdout, stderr) => {
    const out = String(stdout || '');
    const parsedHandoffs = extractBlogHandoffs(out);
    let appliedHandoff = false;
    for (const h of parsedHandoffs) {
      try {
        const r = await applyBlogHandoff(item.id, h as any);
        if (r.applied) appliedHandoff = true;
      } catch {
        // ignore handoff apply errors here; reconcile can still recover
      }
    }

    if (!appliedHandoff && parsedHandoffs.length === 0) {
      const previewUrl = extractPreviewUrl(out);
      if (previewUrl) {
        const markdown = await fetchPreviewAsMarkdown(previewUrl);
        if (markdown) {
          await applyBlogHandoff(item.id, {
            schema: 'handoff.blog.v1',
            run_id: runId,
            work_item_id: item.id,
            stage: 'Human approval wait',
            status: 'ready_for_review',
            content_markdown: markdown,
            metadata: { preview_url: previewUrl },
          });
          appliedHandoff = true;
        }
      }
    }

    const looksLikeHandoff = appliedHandoff || parsedHandoffs.length > 0 || out.includes('handoff.blog.v1') || out.includes('content_markdown') || out.includes('content_html');

    if (err && !looksLikeHandoff) {
      await fetch(`${API_BASE}/work/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          description: item.description || null,
          status: item.status,
          priority: item.priority ?? 0,
          metadata: {
            ...(item.metadata || {}),
            orchestration_status: 'failed',
            error_summary: `Orchestrator dispatch failed: ${err.message}${stderr ? ` | ${String(stderr).slice(0, 500)}` : ''}`,
            next_action: 'Retry start run',
          },
        }),
      }).catch(() => null);
      return;
    }

    await fetch(`${API_BASE}/work/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: item.title,
        description: item.description || null,
        status: item.status,
        priority: item.priority ?? 0,
        metadata: {
          ...(item.metadata || {}),
          orchestration_status: looksLikeHandoff ? 'handoff_received' : 'processing',
          last_agent_update_at: new Date().toISOString(),
          next_action: looksLikeHandoff ? 'Handoff detected, waiting reconcile' : 'Orchestrator running',
          orchestrator_dispatch_raw: stdout || '',
        },
      }),
    }).catch(() => null);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inferred = inferBlogDraft(body || {});
    const runId = (body?.run_id || '').trim() || `run_${Date.now()}`;
    const targetWords = Number(body?.target_words) || 1800;

    const requiredAgents = [BLOG_ORCHESTRATOR_AGENT_ID, BLOG_WRITER_AGENT_ID, BLOG_PUBLISHER_AGENT_ID];
    const available = await getAvailableAgentIds();
    const missing = requiredAgents.filter(id => !available.includes(id));
    if (missing.length) {
      return NextResponse.json({ error: `Missing required agents: ${missing.join(', ')}` }, { status: 400 });
    }

    const createRes = await fetch(`${API_BASE}/work/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: inferred.title,
        status: 'ongoing',
        priority: 0,
        metadata: {
          contextKey: BLOG_CONTEXT,
          source: 'blogs-ui',
          run_id: runId,
          topic: inferred.topic,
          niche: inferred.niche,
          primary_keyword: inferred.primaryKeyword,
          target_words: targetWords,
          requested_mode: 'draft',
          current_stage: 'Content/preview generation',
          status: 'pass',
          content_handoff_valid: 'Y',
          approval_state: 'pending',
          publish_target: 'wordpress',
          publish_mode: 'manual_hold',
          wp_post_id: '',
          wp_url: '',
          image_status: 'pending',
          error_summary: '',
          next_action: 'Queued for generation',
          orchestration_status: 'queued',
          orchestration_started_at: new Date().toISOString(),
          last_agent_update_at: '',
          orchestrator_agent_id: BLOG_ORCHESTRATOR_AGENT_ID,
          writer_agent_id: BLOG_WRITER_AGENT_ID,
          publisher_agent_id: BLOG_PUBLISHER_AGENT_ID,
        },
      }),
    });

    const item = await createRes.json();
    if (!createRes.ok) {
      return NextResponse.json({ error: item?.error || 'Failed to create run' }, { status: createRes.status });
    }

    dispatchOrchestratorAsync({ item, runId, inferred, targetWords });

    return NextResponse.json({ ok: true, itemId: item.id, runId, inferred, dispatch: { queued: true } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to start blog run' }, { status: 500 });
  }
}
