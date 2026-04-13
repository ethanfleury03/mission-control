import { createHash } from 'node:crypto';
import { evaluateDraftQuality } from './quality';

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export type BlogHandoff = {
  schema?: string;
  run_id?: string;
  work_item_id?: string;
  stage?: string;
  status?: string;
  title?: string;
  content_markdown?: string;
  content_html?: string;
  /** Public URL to final blog PDF (n8n / merged output). */
  pdf_url?: string;
  wp_url?: string;
  wp_post_id?: string | number;
  featured_image_url?: string;
  error_summary?: string;
  next_action?: string;
  metadata?: Record<string, any>;
};

type WorkItem = {
  id: string;
  title: string;
  description: string | null;
  status: 'queue' | 'ongoing' | 'need_human' | 'completed';
  priority: number;
  metadata: Record<string, any>;
};

function extractJsonObjects(text: string): any[] {
  const out: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          out.push(JSON.parse(candidate));
        } catch {
          // ignore
        }
        start = -1;
      }
    }
  }

  return out;
}

export function extractBlogHandoffs(rawText: string): BlogHandoff[] {
  const objs = extractJsonObjects(String(rawText || ''));
  return objs.filter((o: any) => {
    if (!o || typeof o !== 'object') return false;
    if (o.schema === 'handoff.blog.v1') return true;
    return Boolean(
      o.run_id &&
        (o.content_markdown || o.content_html || o.pdf_url || o.wp_url || o.wp_post_id || o.error_summary),
    );
  });
}

export function extractPreviewUrl(rawText: string): string | null {
  const text = String(rawText || '');
  const m = text.match(/https?:\/\/[^\s"'`<>]+/i);
  return m ? m[0] : null;
}

export async function fetchPreviewAsMarkdown(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const html = await res.text();
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<h1[^>]*>/gi, '\n# ')
      .replace(/<h2[^>]*>/gi, '\n## ')
      .replace(/<h3[^>]*>/gi, '\n### ')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
    return body.length > 200 ? body.slice(0, 30000) : null;
  } catch {
    return null;
  }
}

function digestHandoff(h: BlogHandoff): string {
  const stable = JSON.stringify({
    run_id: h.run_id || '',
    stage: h.stage || '',
    status: h.status || '',
    content_markdown: h.content_markdown || '',
    content_html: h.content_html || '',
    pdf_url: h.pdf_url || '',
    wp_url: h.wp_url || '',
    wp_post_id: h.wp_post_id || '',
    error_summary: h.error_summary || '',
    next_action: h.next_action || '',
  });
  return createHash('sha1').update(stable).digest('hex');
}

export async function applyBlogHandoff(itemId: string, handoff: BlogHandoff): Promise<{ applied: boolean; deduped?: boolean; stage?: string }> {
  const getRes = await fetch(`${API_BASE}/work/items/${itemId}`, { cache: 'no-store' });
  const item = (await getRes.json()) as WorkItem;
  if (!getRes.ok || !item?.id) throw new Error('Work item not found');

  const runId = String(item.metadata?.run_id || '');
  if (handoff.run_id && runId && String(handoff.run_id) !== runId) {
    throw new Error(`run_id mismatch: expected ${runId}, got ${handoff.run_id}`);
  }

  const digest = digestHandoff(handoff);
  if (item.metadata?.last_handoff_digest === digest) {
    return { applied: false, deduped: true, stage: item.metadata?.current_stage };
  }

  const hasDraft = Boolean(handoff.content_markdown || handoff.content_html || handoff.pdf_url);
  const hasPublish = Boolean(handoff.wp_url || handoff.wp_post_id);
  const failed = Boolean(handoff.error_summary) || handoff.status === 'failed';

  const metadataPatch: Record<string, any> = {
    ...(handoff.metadata || {}),
    last_handoff_digest: digest,
    last_handoff_at: new Date().toISOString(),
    last_agent_update_at: new Date().toISOString(),
    handoff_schema: handoff.schema || 'handoff.blog.v1',
  };

  if (handoff.content_markdown) metadataPatch.content_markdown = handoff.content_markdown;
  if (handoff.content_html) metadataPatch.content_html = handoff.content_html;
  if (handoff.pdf_url) metadataPatch.pdf_url = handoff.pdf_url;
  if (handoff.featured_image_url) metadataPatch.featured_image_url = handoff.featured_image_url;
  if (handoff.wp_url) metadataPatch.wp_url = handoff.wp_url;
  if (handoff.wp_post_id) metadataPatch.wp_post_id = handoff.wp_post_id;
  if (handoff.error_summary) metadataPatch.error_summary = handoff.error_summary;

  let nextStatus: WorkItem['status'] = item.status;

  if (hasPublish) {
    metadataPatch.current_stage = 'Status report back';
    metadataPatch.publish_status = 'success';
    metadataPatch.next_action = handoff.next_action || 'Published successfully';
    metadataPatch.error_summary = '';
    nextStatus = 'completed';
  } else if (hasDraft) {
    const pdfOnly = Boolean(handoff.pdf_url || item.metadata?.pdf_url) &&
      !(handoff.content_markdown || handoff.content_html || item.metadata?.content_markdown || item.metadata?.content_html);
    const q = pdfOnly
      ? { pass: true, score: 100, checks: { pdf_ready: true }, reasons: [] as string[] }
      : evaluateDraftQuality({
          content_markdown: handoff.content_markdown || item.metadata?.content_markdown,
          content_html: handoff.content_html || item.metadata?.content_html,
          title: handoff.title || item.title,
          primary_keyword: item.metadata?.primary_keyword,
          target_words: item.metadata?.target_words,
        });

    metadataPatch.quality_gate = q.pass ? 'pass' : 'fail';
    metadataPatch.quality_score = q.score;
    metadataPatch.quality_checks = q.checks;
    metadataPatch.quality_reasons = q.reasons;

    metadataPatch.current_stage = 'Human approval wait';
    metadataPatch.orchestration_status = 'ready_for_review';
    metadataPatch.next_action = q.pass ? (handoff.next_action || 'Awaiting human decision') : `Needs revision: ${q.reasons[0] || 'Quality gate failed'}`;
    if (!failed && q.pass) metadataPatch.error_summary = '';
    nextStatus = 'need_human';
  } else if (failed) {
    metadataPatch.current_stage = handoff.stage || item.metadata?.current_stage || 'Content/preview generation';
    metadataPatch.publish_status = metadataPatch.current_stage === 'WordPress publish handoff' ? 'failed' : item.metadata?.publish_status;
    metadataPatch.next_action = handoff.next_action || 'Needs attention';
    nextStatus = 'need_human';
  } else if (handoff.stage) {
    metadataPatch.current_stage = handoff.stage;
    metadataPatch.next_action = handoff.next_action || item.metadata?.next_action || '';
  }

  await fetch(`${API_BASE}/work/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: handoff.title || item.title,
      description: item.description || null,
      status: nextStatus,
      priority: item.priority ?? 0,
      metadata: { ...(item.metadata || {}), ...metadataPatch },
    }),
  });

  return { applied: true, stage: metadataPatch.current_stage };
}
