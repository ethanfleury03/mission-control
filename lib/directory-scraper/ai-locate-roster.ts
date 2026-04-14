/**
 * Pass 1 — AI locates where member/company rosters live (no name extraction).
 * Outputs must be grounded: URLs from the provided link list only;
 * text spans must be verbatim substrings of the page text.
 */

import * as cheerio from 'cheerio';
import { normalizeUrl } from './utils';
import { validateScrapeUrl } from './validate-scrape-url';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Visible text sent to locator model (member lists often sit mid-page). */
const MAX_LOCATE_TEXT = 48_000;
/** Max links sent (href + short label). */
const MAX_LINKS = 250;

export interface PageLink {
  href: string;
  text: string;
}

export interface LocateRosterInput {
  pageTitle?: string;
  baseUrl: string;
  visibleText: string;
  links: PageLink[];
}

export interface LocateRosterResult {
  rosterUrls: string[];
  textSpans: string[];
  modelUsed: string;
  error?: string;
}

function normalizeHref(h: string): string {
  return h.trim().split('#')[0];
}

export async function locateRosterWithAi(input: LocateRosterInput): Promise<LocateRosterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { rosterUrls: [], textSpans: [], modelUsed: '', error: 'OPENROUTER_API_KEY not set' };
  }

  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || DEFAULT_MODEL;
  const textSample = input.visibleText.slice(0, MAX_LOCATE_TEXT);
  const linkSlice = input.links.slice(0, MAX_LINKS).map((l) => ({
    u: normalizeHref(l.href),
    t: l.text.replace(/\s+/g, ' ').trim().slice(0, 120),
  }));

  const allowedUrls = new Set(linkSlice.map((l) => l.u));

  const prompt = `You are locating where a MEMBER DIRECTORY or COMPANY ROSTER appears on a website.

BASE_URL: ${input.baseUrl}
PAGE_TITLE: ${input.pageTitle ?? '(none)'}

LINKS (each has "u" = full URL, "t" = anchor text). You may ONLY suggest roster URLs from this list — copy "u" exactly.
${JSON.stringify(linkSlice)}

VISIBLE_TEXT (first ${textSample.length} chars of page — roster may be here or deeper on linked pages):
${textSample}

Return ONLY valid JSON:
{
  "rosterUrls": string[],
  "textSpans": string[]
}

Rules:
1. rosterUrls: 0–5 URLs from LINKS that most likely lead to a full member/company/exhibitor directory (not login, cart, generic "about"). Copy "u" exactly. Same-origin as BASE_URL preferred.
2. textSpans: 0–8 contiguous VERBATIM excerpts from VISIBLE_TEXT above that contain actual company/member name lists (paragraphs or sections). Each string must appear EXACTLY as in VISIBLE_TEXT — copy-paste only, no edits. If the roster is only on another page, textSpans can be empty.
3. Do NOT extract individual company names — only locate regions or URLs.
4. If unsure, return empty arrays.

JSON only:`;

  const supportsJsonFormat =
    model.startsWith('openai/') || model.startsWith('gpt-') || model === 'o1' || model === 'o3-mini';

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    messages: [{ role: 'user' as const, content: prompt }],
  };
  if (supportsJsonFormat) {
    body.response_format = { type: 'json_object' };
  }

  let rawJson: string | undefined;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90_000);
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Directory Scraper',
      },
      body: JSON.stringify(body),
    });
    clearTimeout(t);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        rosterUrls: [],
        textSpans: [],
        modelUsed: model,
        error: `OpenRouter ${res.status}: ${errText.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    rawJson = data.choices?.[0]?.message?.content;
  } catch (err: unknown) {
    return {
      rosterUrls: [],
      textSpans: [],
      modelUsed: model,
      error: err instanceof Error ? err.message : 'OpenRouter request failed',
    };
  }

  if (!rawJson) {
    return { rosterUrls: [], textSpans: [], modelUsed: model, error: 'Empty locate response' };
  }

  let parsed: { rosterUrls?: unknown; textSpans?: unknown };
  try {
    parsed = JSON.parse(rawJson) as { rosterUrls?: unknown; textSpans?: unknown };
  } catch {
    return { rosterUrls: [], textSpans: [], modelUsed: model, error: 'Invalid JSON from locate model' };
  }

  const rawUrls = Array.isArray(parsed.rosterUrls)
    ? parsed.rosterUrls.filter((x): x is string => typeof x === 'string')
    : [];
  const rosterUrls = rawUrls
    .map((u) => normalizeHref(u))
    .filter((u) => allowedUrls.has(u))
    .slice(0, 5);

  const fullLower = input.visibleText.toLowerCase();
  const rawSpans = Array.isArray(parsed.textSpans)
    ? parsed.textSpans.filter((x): x is string => typeof x === 'string' && x.trim().length > 20)
    : [];

  const textSpans: string[] = [];
  for (const span of rawSpans) {
    const s = span.trim();
    if (s.length < 20 || s.length > 120_000) continue;
    if (!fullLower.includes(s.toLowerCase())) continue;
    textSpans.push(s);
    if (textSpans.length >= 8) break;
  }

  return { rosterUrls, textSpans, modelUsed: model };
}

/** Same-origin http(s) links from HTML for the locator model (grounded URL list). */
export function collectSameOriginLinks(html: string, pageUrl: string): PageLink[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const out: PageLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    let abs: string;
    try {
      abs = normalizeUrl(href, pageUrl);
    } catch {
      return;
    }
    const v = validateScrapeUrl(abs);
    if (!v.ok || !v.normalizedUrl) return;
    abs = v.normalizedUrl;
    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      return;
    }
    if (u.origin !== base.origin) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200);
    out.push({ href: abs, text: text || abs });
  });

  return out.slice(0, 400);
}
