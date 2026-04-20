import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate } from './types';
import { normalizeForCompareKey } from './dedupe-company-candidates';
import { normalizeUrl } from './utils';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_VISIBLE_TEXT = 32_000;
const MAX_LINKS = 350;

export interface PageRosterLink {
  href: string;
  text: string;
}

export interface PageRosterExtractionInput {
  pageUrl: string;
  pageTitle?: string;
  visibleText: string;
  links: PageRosterLink[];
}

export interface PageRosterExtractionResult {
  candidates: ExtractedCompanyCandidate[];
  modelUsed: string;
  error?: string;
  rawCount?: number;
}

function supportsJsonResponseFormat(model: string): boolean {
  return model.startsWith('openai/') || model.startsWith('gpt-') || model === 'o1' || model === 'o3-mini';
}

function normalizeHref(href: string): string {
  return href.trim().split('#')[0];
}

function buildPrompt(input: PageRosterExtractionInput): string {
  const visibleText = input.visibleText.slice(0, MAX_VISIBLE_TEXT);
  const links = input.links.slice(0, MAX_LINKS).map((link) => ({
    href: normalizeHref(link.href),
    text: link.text.replace(/\s+/g, ' ').trim().slice(0, 140),
  }));

  return `You are extracting company roster rows from ONE paginated directory page.

PAGE_URL: ${input.pageUrl}
PAGE_TITLE: ${input.pageTitle ?? '(none)'}

VISIBLE_TEXT:
${visibleText}

LINKS:
${JSON.stringify(links)}

Return ONLY valid JSON in this exact shape:
{
  "companies": [
    {
      "name": "Exact company name from VISIBLE_TEXT",
      "directoryUrl": "Exact URL from LINKS or empty string",
      "website": "Exact URL from LINKS or empty string"
    }
  ]
}

Rules:
1. Every "name" must be an exact verbatim substring from VISIBLE_TEXT.
2. Every URL must be copied exactly from LINKS. Never invent or infer URLs.
3. "directoryUrl" should be the member/profile/listing URL for that company when available.
4. "website" should only be an external company website if it is explicitly present in LINKS for that company.
5. If you are unsure about a URL, use an empty string.
6. Do not return duplicates.
7. Exclude pagination, navigation, filters, categories, cities, and non-company labels.
8. JSON only.`;
}

async function openRouterJson(
  model: string,
  userContent: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY not set' };

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    messages: [{ role: 'user' as const, content: userContent }],
  };
  if (supportsJsonResponseFormat(model)) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `OpenRouter ${res.status}: ${errText.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (data.error?.message) return { ok: false, error: data.error.message };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: 'Empty response from model' };
    return { ok: true, content };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, error: msg.includes('abort') ? 'OpenRouter request timed out' : msg };
  }
}

function chooseBetterUrl(current: string | undefined, candidate: string): string {
  if (!current) return candidate;
  const currentLen = current.length;
  const candidateLen = candidate.length;
  if (candidateLen > currentLen) return candidate;
  return current;
}

export function collectPageLinks(html: string, pageUrl: string): PageRosterLink[] {
  const $ = cheerio.load(html || '<html></html>');
  const out: PageRosterLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    let abs = '';
    try {
      abs = normalizeUrl(href, pageUrl);
      const parsed = new URL(abs);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      abs = parsed.toString();
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    const text = $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200);
    out.push({ href: abs, text: text || abs });
  });

  return out.slice(0, 600);
}

export async function extractPageRosterWithAi(
  input: PageRosterExtractionInput,
): Promise<PageRosterExtractionResult> {
  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildPrompt(input);
  const res = await openRouterJson(model, prompt);
  if (!res.ok) {
    return { candidates: [], modelUsed: model, error: res.error };
  }

  let parsed: { companies?: unknown };
  try {
    parsed = JSON.parse(res.content) as { companies?: unknown };
  } catch {
    return { candidates: [], modelUsed: model, error: `Invalid JSON: ${res.content.slice(0, 200)}` };
  }

  const allowedLinks = new Map<string, PageRosterLink>();
  for (const link of input.links) {
    allowedLinks.set(normalizeHref(link.href), link);
  }

  const fullLower = input.visibleText.toLowerCase();
  const rawCompanies = Array.isArray(parsed.companies) ? parsed.companies : [];
  const byName = new Map<string, ExtractedCompanyCandidate>();

  for (const item of rawCompanies) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { name?: unknown; directoryUrl?: unknown; website?: unknown };
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name || !fullLower.includes(name.toLowerCase())) continue;

    const normalizedName = normalizeForCompareKey(name);
    const directoryUrlRaw = typeof rec.directoryUrl === 'string' ? normalizeHref(rec.directoryUrl) : '';
    const websiteRaw = typeof rec.website === 'string' ? normalizeHref(rec.website) : '';

    const directoryUrl = directoryUrlRaw && allowedLinks.has(directoryUrlRaw) ? directoryUrlRaw : '';
    const website = websiteRaw && allowedLinks.has(websiteRaw) ? websiteRaw : '';

    const candidate: ExtractedCompanyCandidate = {
      name,
      normalizedName,
      sourceUrl: input.pageUrl,
      sourceText: name,
      method: 'ai-classified',
      confidence: website ? 92 : directoryUrl ? 90 : 86,
      reasons: [
        'ai-page-roster',
        'grounded-name',
        `model:${model}`,
      ],
      ...(directoryUrl ? { listingUrl: directoryUrl, detailUrl: directoryUrl } : {}),
      ...(website ? { companyWebsiteHint: website } : {}),
    };

    const existing = byName.get(normalizedName);
    if (!existing) {
      byName.set(normalizedName, candidate);
      continue;
    }

    byName.set(normalizedName, {
      ...existing,
      listingUrl: chooseBetterUrl(existing.listingUrl, directoryUrl),
      detailUrl: chooseBetterUrl(existing.detailUrl, directoryUrl),
      companyWebsiteHint: chooseBetterUrl(existing.companyWebsiteHint, website),
      confidence: Math.max(existing.confidence, candidate.confidence),
      reasons: existing.reasons,
    });
  }

  const candidates = [...byName.values()];
  return {
    candidates,
    modelUsed: model,
    rawCount: rawCompanies.length,
  };
}
