/**
 * Optional n8n webhook integration for blog runs.
 *
 * When N8N_BLOG_WEBHOOK_URL is set, Start / Retry POST to this URL instead of OpenClaw.
 * Your workflow should call back POST {callback_url} with JSON:
 *   { "handoff": { "schema": "handoff.blog.v1", "run_id", "work_item_id", "content_markdown"|"content_html", "featured_image_url", "pdf_url", ... } }
 * Or the same fields at the top level; see /api/blogs/handoff.
 *
 * Optional env:
 *   N8N_BLOG_WEBHOOK_SECRET — sent as Authorization: Bearer <secret> on the outbound webhook
 *   BLOG_HANDOFF_SECRET — if set, /api/blogs/handoff requires matching Bearer or X-Blog-Handoff-Secret
 *   NEXT_PUBLIC_APP_URL — used to build default callback_url (e.g. https://your-dashboard.example)
 */

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001';

export function isN8nBlogPipelineEnabled(): boolean {
  return Boolean(process.env.N8N_BLOG_WEBHOOK_URL?.trim());
}

function publicAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return '';
}

export function buildBlogHandoffCallbackUrl(): string {
  const origin = publicAppOrigin();
  if (origin) return `${origin}/api/blogs/handoff`;
  return '/api/blogs/handoff';
}

export type N8nBlogWebhookPayload = {
  event: 'blog_run_start' | 'blog_run_retry';
  work_item_id: string;
  run_id: string;
  title: string;
  topic: string;
  niche: string;
  primary_keyword: string;
  target_words: number;
  callback_url: string;
  api_base: string;
  handoff_secret_configured: boolean;
};

export async function postN8nBlogWebhook(payload: N8nBlogWebhookPayload): Promise<{ ok: boolean; status: number; body: string }> {
  const url = process.env.N8N_BLOG_WEBHOOK_URL!.trim();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const secret = process.env.N8N_BLOG_WEBHOOK_SECRET?.trim();
  if (secret) headers['Authorization'] = `Bearer ${secret}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, body: body.slice(0, 2000) };
}

export function n8nApiBaseForPayload(): string {
  return API_BASE.replace(/\/$/, '');
}
