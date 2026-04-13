/**
 * Pass 2 — AI extracts company names from text (verbatim substrings only).
 * Large pages are split into chunks so each OpenRouter call stays fast.
 */

import type { ExtractedCompanyCandidate } from './types';
import { normalizeForCompareKey } from './dedupe-company-candidates';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Max chars per extraction request (keeps latency reasonable). */
const CHUNK_MAX_CHARS = 22_000;

/** Timeout per OpenRouter request (ms). */
const REQUEST_TIMEOUT_MS = 120_000;

const DEFAULT_MODEL = 'minimax/minimax-m2.7';

export interface AiExtractionOptions {
  visibleText: string;
  sourceUrl: string;
  pageTitle?: string;
}

export interface AiExtractionResult {
  candidates: ExtractedCompanyCandidate[];
  rawNames: string[];
  droppedCount: number;
  modelUsed: string;
  error?: string;
  chunksProcessed?: number;
}

function isGroundedSubstring(name: string, text: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  return text.toLowerCase().includes(n.toLowerCase());
}

/** Split on paragraph boundaries when possible to avoid cutting mid-company. */
export function splitTextIntoExtractionChunks(text: string, maxChars: number = CHUNK_MAX_CHARS): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];

  const chunks: string[] = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + maxChars, t.length);
    if (end < t.length) {
      const slice = t.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\r\n\r\n'),
        slice.lastIndexOf('\n'),
      );
      if (breakAt > maxChars * 0.25) {
        end = start + breakAt + 1;
      }
    }
    const piece = t.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);
    start = end;
  }
  return chunks;
}

function buildExtractPrompt(text: string, pageTitle?: string): string {
  const titleLine = pageTitle ? `Page title: "${pageTitle}"\n\n` : '';
  return `${titleLine}You are extracting company and organization names from a MEMBER ROSTER or DIRECTORY excerpt.

Rules you MUST follow:
1. Return ONLY a JSON object: {"companies": ["Name 1", "Name 2", ...]}
2. Every name MUST be an exact verbatim substring of the TEXT below. Copy exactly — no paraphrase or invention.
3. Only real organizations, companies, brands, associations. Exclude: nav labels, section headings alone, CTAs, addresses, phone numbers.
4. If none, return {"companies": []}.

TEXT:
${text}`;
}

async function openRouterJson(
  model: string,
  userContent: string,
): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: 'OPENROUTER_API_KEY not set' };

  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    messages: [{ role: 'user' as const, content: userContent }],
  };

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

function parseCompaniesJson(rawJson: string): { companies: string[]; error?: string } {
  let parsed: { companies?: unknown };
  try {
    parsed = JSON.parse(rawJson) as { companies?: unknown };
  } catch {
    return { companies: [], error: `Invalid JSON: ${rawJson.slice(0, 200)}` };
  }
  const companies = Array.isArray(parsed.companies)
    ? parsed.companies.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  return { companies };
}

/** Single chunk extraction (internal). */
async function extractOneChunk(
  chunkText: string,
  sourceUrl: string,
  pageTitle: string | undefined,
  model: string,
): Promise<{ names: string[]; rawNames: string[]; dropped: number; error?: string }> {
  const res = await openRouterJson(model, buildExtractPrompt(chunkText, pageTitle));
  if (!res.ok) return { names: [], rawNames: [], dropped: 0, error: res.error };

  const { companies, error } = parseCompaniesJson(res.content);
  if (error) return { names: [], rawNames: companies, dropped: 0, error };

  const grounded: string[] = [];
  let dropped = 0;
  const seen = new Set<string>();

  for (const name of companies) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    if (!isGroundedSubstring(trimmed, chunkText)) {
      dropped++;
      continue;
    }
    seen.add(key);
    grounded.push(trimmed);
  }

  return { names: grounded, rawNames: companies, dropped };
}

/**
 * Extract company names from one or more text blobs (e.g. locate spans + full page).
 * Chunks each blob for latency; dedupes across chunks.
 */
export async function extractCompanyNamesWithAi(options: AiExtractionOptions): Promise<AiExtractionResult> {
  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || DEFAULT_MODEL;

  const blobs = [options.visibleText].filter((s) => s.trim().length > 0);
  const allChunks: string[] = [];
  for (const b of blobs) {
    allChunks.push(...splitTextIntoExtractionChunks(b, CHUNK_MAX_CHARS));
  }

  if (allChunks.length === 0) {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: model,
      error: 'No text to extract from',
      chunksProcessed: 0,
    };
  }

  const mergedNames = new Map<string, string>();
  const allRaw: string[] = [];
  let totalDropped = 0;
  let lastError: string | undefined;

  for (const chunk of allChunks) {
    const r = await extractOneChunk(chunk, options.sourceUrl, options.pageTitle, model);
    allRaw.push(...r.rawNames);
    totalDropped += r.dropped;
    if (r.error) lastError = r.error;
    for (const n of r.names) {
      const key = n.toLowerCase();
      if (!mergedNames.has(key) || n.length > (mergedNames.get(key)?.length ?? 0)) {
        mergedNames.set(key, n);
      }
    }
  }

  const candidates: ExtractedCompanyCandidate[] = [...mergedNames.values()].map((name) => ({
    name,
    normalizedName: normalizeForCompareKey(name),
    sourceUrl: options.sourceUrl,
    method: 'ai-classified',
    confidence: 85,
    reasons: ['ai-pass2-extract', 'grounding-validated', `model:${model}`, `chunks:${allChunks.length}`],
    sourceText: name,
  }));

  return {
    candidates,
    rawNames: allRaw,
    droppedCount: totalDropped,
    modelUsed: model,
    error: lastError,
    chunksProcessed: allChunks.length,
  };
}

export function isAiExtractionAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Dedupe near-identical blobs (same start) to avoid duplicate API calls. */
function uniqueBlobs(blobs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of blobs) {
    const t = b.trim();
    if (t.length < 30) continue;
    const key = t.slice(0, 400).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Pass 2 across multiple text regions (locate spans + follow-up pages).
 * Chunks each blob; merges and dedupes company names.
 */
export async function extractCompanyNamesFromTextBlobs(
  blobs: string[],
  options: { sourceUrl: string; pageTitle?: string },
): Promise<AiExtractionResult> {
  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || DEFAULT_MODEL;
  const unique = uniqueBlobs(blobs);

  if (unique.length === 0) {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: model,
      error: 'No text blobs to extract',
      chunksProcessed: 0,
    };
  }

  const allChunks: string[] = [];
  for (const b of unique) {
    allChunks.push(...splitTextIntoExtractionChunks(b, CHUNK_MAX_CHARS));
  }

  const mergedNames = new Map<string, string>();
  const allRaw: string[] = [];
  let totalDropped = 0;
  let lastError: string | undefined;

  for (const chunk of allChunks) {
    const r = await extractOneChunk(chunk, options.sourceUrl, options.pageTitle, model);
    allRaw.push(...r.rawNames);
    totalDropped += r.dropped;
    if (r.error) lastError = r.error;
    for (const n of r.names) {
      const key = n.toLowerCase();
      if (!mergedNames.has(key) || n.length > (mergedNames.get(key)?.length ?? 0)) {
        mergedNames.set(key, n);
      }
    }
  }

  const candidates: ExtractedCompanyCandidate[] = [...mergedNames.values()].map((name) => ({
    name,
    normalizedName: normalizeForCompareKey(name),
    sourceUrl: options.sourceUrl,
    method: 'ai-classified',
    confidence: 88,
    reasons: [
      'ai-pass2-multi-blob',
      'grounding-validated',
      `model:${model}`,
      `blobs:${unique.length}`,
      `chunks:${allChunks.length}`,
    ],
    sourceText: name,
  }));

  return {
    candidates,
    rawNames: allRaw,
    droppedCount: totalDropped,
    modelUsed: model,
    error: lastError,
    chunksProcessed: allChunks.length,
  };
}
