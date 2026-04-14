import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate } from './types';
import { normalizeForCompareKey } from './dedupe-company-candidates';
import { MENU_JUNK } from './name-extraction-constants';

function stripScriptsStyles(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $.html();
}

function splitLines(html: string): string[] {
  const cleaned = stripScriptsStyles(html);
  const $ = cheerio.load(cleaned);
  $('br').replaceWith('\n');
  const text = $('body').length ? $('body').text() : $.root().text();
  return text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function looksLikeJsonFragment(s: string): boolean {
  const t = s.trim();
  if (/^[\[{]/.test(t)) return true;
  if (/^"[@\w]+":/.test(t)) return true;
  if (t.includes('"@type"') || t.includes('"@context"')) return true;
  if ((t.match(/"/g) ?? []).length >= 4 && (t.includes('{') || t.includes('}'))) return true;
  return false;
}

function splitEnumeration(line: string): string[] {
  if (line.includes(';')) return line.split(';').map((s) => s.trim()).filter(Boolean);
  if (/•|\u2022|\u00B7/.test(line)) return line.split(/•|\u2022|\u00B7/).map((s) => s.trim()).filter(Boolean);
  if (line.includes(',')) {
    const parts = line.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 3 && parts.length <= 40 && parts.every((p) => p.length < 80)) return parts;
  }
  return [line];
}

export function extractFromPlainText(
  fragmentHtml: string,
  sourceUrl: string,
  containerMeta?: { selectorPath: string; score: number },
): ExtractedCompanyCandidate[] {
  const lines = splitLines(fragmentHtml);
  const out: ExtractedCompanyCandidate[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (line.length > 300) continue;
    if (looksLikeJsonFragment(line)) continue;
    if (/^(welcome|thank you|this page|we represent|learn more)/i.test(line.trim())) continue;
    const parts = splitEnumeration(line);
    for (const part of parts) {
      if (part.length < 3 || part.length > 180) continue;
      if (looksLikeJsonFragment(part)) continue;
      const lower = part.toLowerCase();
      if (MENU_JUNK.has(lower)) continue;
      if (/\b(our|the|and|or|for|with|this|that|welcome|represent)\b/i.test(part) && part.split(/\s+/).length <= 8) {
        if (!/\b(inc|llc|ltd|corp|company|group)\b/i.test(part)) continue;
      }
      if (/\b(the|and|or|for|with|this|that)\b/i.test(part) && part.split(/\s+/).length > 6) continue;
      if (/[.!?].+[.!?]/.test(part) && part.split(/\s+/).length > 6) continue;
      const key = lower;
      if (seen.has(key)) continue;

      const wc = part.split(/\s+/).length;
      const fromMultiPart = parts.length > 1;
      const hasOrgSuffix = /\b(inc|llc|ltd|corp|corporation|company|group|industries|solutions)\b/i.test(part);
      if (!fromMultiPart && wc < 3 && !hasOrgSuffix) continue;
      if (/\bpage$/i.test(part.trim()) && wc <= 3 && !hasOrgSuffix) continue;

      seen.add(key);
      out.push({
        name: part,
        normalizedName: normalizeForCompareKey(part),
        sourceUrl,
        method: 'plain-text',
        confidence: 42,
        reasons: ['line/enum split'],
        sourceText: part,
        containerSelector: containerMeta?.selectorPath,
        containerScore: containerMeta?.score,
      });
    }
  }

  return out;
}
