import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';

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

function inferBlogDraft(input: any) {
  const seed = [input?.title, input?.topic, input?.niche, input?.primary_keyword].find((v: any) => typeof v === 'string' && v.trim()) || '';
  const fallbackTopic = FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
  const topic = (input?.topic || '').trim() || seed || fallbackTopic;
  const niche = (input?.niche || '').trim() || topic.split(' ')[0]?.replace(/[^a-zA-Z0-9-]/g, '') || 'industry';
  const primaryKeyword = (input?.primary_keyword || '').trim() || topic.toLowerCase().split(' ').slice(0, 3).join(' ');
  const title = (input?.title || '').trim() || `${topic.replace(/\.$/, '')}: Practical Guide for 2026`;
  return { title, topic, niche, primaryKeyword };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inferred = inferBlogDraft(body || {});
    const runId = (body?.run_id || '').trim() || `run_${Date.now()}`;
    const targetWords = Number(body?.target_words) || 1800;

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
          wp_post_id: '',
          wp_url: '',
          image_status: 'pending',
          error_summary: '',
          next_action: 'Generating draft content',
          orchestration_status: 'queued',
        },
      }),
    });

    const item = await createRes.json();
    if (!createRes.ok) {
      return NextResponse.json({ error: item?.error || 'Failed to create run' }, { status: createRes.status });
    }

    const orchestrationPrompt = [
      `Start a blog generation run and update work item metadata for context ${BLOG_CONTEXT}.`,
      `run_id: ${runId}`,
      `work_item_id: ${item.id}`,
      `title: ${inferred.title}`,
      `topic: ${inferred.topic}`,
      `niche: ${inferred.niche}`,
      `primary_keyword: ${inferred.primaryKeyword}`,
      `target_words: ${targetWords}`,
      `requirements: produce draft markdown, and store it as metadata.content_markdown and/or metadata.content_html. Set metadata.current_stage to Human approval wait when draft preview is ready.`,
    ].join('\n');

    let dispatch: any = { success: false, error: 'Not attempted' };
    try {
      const { stdout } = await execFileAsync('openclaw', ['agent', '--agent', 'blog-orchestrator', '--message', orchestrationPrompt, '--json'], {
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
      dispatch = { success: true, raw: stdout };
    } catch (err: any) {
      dispatch = { success: false, error: err?.message || 'Dispatch failed' };
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
            error_summary: `Orchestrator dispatch failed: ${dispatch.error}`,
            next_action: 'Retry start run',
          },
        }),
      });
    }

    return NextResponse.json({ ok: true, itemId: item.id, runId, inferred, dispatch });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to start blog run' }, { status: 500 });
  }
}
