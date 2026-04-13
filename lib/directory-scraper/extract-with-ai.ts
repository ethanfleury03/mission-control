/**
 * AI-first company name extraction using OpenRouter.
 *
 * The model is only allowed to return exact substrings of the provided text.
 * Every returned name is validated against the source; anything that isn't
 * a verbatim substring is dropped before it reaches the caller.
 *
 * No hardcoded site rules. Works on prose blobs, tables, card grids, anything
 * that renders into visible text.
 */

import type { ExtractedCompanyCandidate } from './types';
import { normalizeForCompareKey } from './dedupe-company-candidates';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Max visible-text chars sent to the model (fits well within 128k context). */
const MAX_TEXT_CHARS = 80_000;

/** Model used if DIRECTORY_SCRAPER_AI_MODEL is not set. */
const DEFAULT_MODEL = 'minimax/minimax-m2.7';

export interface AiExtractionOptions {
  /** Page visible text (innerText). */
  visibleText: string;
  sourceUrl: string;
  /** Optional page title for context. */
  pageTitle?: string;
}

export interface AiExtractionResult {
  candidates: ExtractedCompanyCandidate[];
  rawNames: string[];
  droppedCount: number;
  modelUsed: string;
  error?: string;
}

function isGroundedSubstring(name: string, text: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  // Direct substring check (case-insensitive)
  return text.toLowerCase().includes(n.toLowerCase());
}

function buildPrompt(text: string, pageTitle?: string): string {
  const titleLine = pageTitle ? `Page title: "${pageTitle}"\n\n` : '';
  return `${titleLine}You are extracting company and organization names from web page text scraped from an association, directory, trade group, or member roster page.

Rules you MUST follow:
1. Return ONLY a JSON object: {"companies": ["Name 1", "Name 2", ...]}
2. Every name you return MUST be an exact verbatim substring of the TEXT provided below. Copy names exactly as they appear — do not paraphrase, abbreviate, expand, or invent anything.
3. Include only actual organizations, companies, associations, brands, or businesses. Exclude: navigation labels, section headings, CTA buttons, page titles, addresses, phone numbers, generic phrases.
4. If a name appears multiple times with slightly different formatting, return it once in the most complete form.
5. If you cannot find any company names, return {"companies": []}.

TEXT:
${text}`;
}

export async function extractCompanyNamesWithAi(
  options: AiExtractionOptions,
): Promise<AiExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: '',
      error: 'OPENROUTER_API_KEY not set',
    };
  }

  const model = process.env.DIRECTORY_SCRAPER_AI_MODEL?.trim() || DEFAULT_MODEL;
  const truncatedText = options.visibleText.slice(0, MAX_TEXT_CHARS);

  const body = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    messages: [
      {
        role: 'user' as const,
        content: buildPrompt(truncatedText, options.pageTitle),
      },
    ],
  };

  let rawJson: string | undefined;
  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Directory Scraper',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        candidates: [],
        rawNames: [],
        droppedCount: 0,
        modelUsed: model,
        error: `OpenRouter ${res.status}: ${errText.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };

    if (data.error?.message) {
      return {
        candidates: [],
        rawNames: [],
        droppedCount: 0,
        modelUsed: model,
        error: data.error.message,
      };
    }

    rawJson = data.choices?.[0]?.message?.content;
  } catch (err: unknown) {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: model,
      error: err instanceof Error ? err.message : 'Network error calling OpenRouter',
    };
  }

  if (!rawJson) {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: model,
      error: 'Empty response from model',
    };
  }

  let parsed: { companies?: unknown };
  try {
    parsed = JSON.parse(rawJson) as { companies?: unknown };
  } catch {
    return {
      candidates: [],
      rawNames: [],
      droppedCount: 0,
      modelUsed: model,
      error: `Model returned invalid JSON: ${rawJson.slice(0, 200)}`,
    };
  }

  const rawNames: string[] = Array.isArray(parsed.companies)
    ? parsed.companies.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  // Grounding validation: every name must be a real substring of the page text.
  const groundedNames: string[] = [];
  let droppedCount = 0;
  const seen = new Set<string>();

  for (const name of rawNames) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    if (!isGroundedSubstring(trimmed, options.visibleText)) {
      droppedCount++;
      continue;
    }
    seen.add(key);
    groundedNames.push(trimmed);
  }

  const candidates: ExtractedCompanyCandidate[] = groundedNames.map((name) => ({
    name,
    normalizedName: normalizeForCompareKey(name),
    sourceUrl: options.sourceUrl,
    method: 'ai-classified',
    confidence: 85,
    reasons: ['ai-extracted', 'grounding-validated', `model:${model}`],
    sourceText: name,
  }));

  return { candidates, rawNames, droppedCount, modelUsed: model };
}

export function isAiExtractionAvailable(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}
