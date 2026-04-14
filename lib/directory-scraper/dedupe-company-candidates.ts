import type { ExtractedCompanyCandidate, NameExtractionMethod } from './types';
import { METHOD_PRIORITY } from './name-extraction-constants';

const LEGAL_SUFFIX = /\b(inc\.?|llc|l\.l\.c\.?|ltd\.?|co\.?|corp\.?|corporation|company)\b/gi;

export function normalizeForCompareKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\w\s&'-]/gi, '')
    .replace(/\s+/g, ' ');
}

export function secondaryDedupeKey(name: string): string {
  return normalizeForCompareKey(name).replace(LEGAL_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

function methodRank(m: NameExtractionMethod): number {
  return METHOD_PRIORITY[m] ?? 50;
}

export function dedupeCompanyCandidates(candidates: ExtractedCompanyCandidate[]): ExtractedCompanyCandidate[] {
  const byPrimary = new Map<string, ExtractedCompanyCandidate>();

  for (const c of candidates) {
    const key = normalizeForCompareKey(c.name);
    if (!key) continue;
    const existing = byPrimary.get(key);
    if (!existing) {
      byPrimary.set(key, c);
      continue;
    }
    byPrimary.set(key, pickBetter(existing, c));
  }

  const list = [...byPrimary.values()];
  const bySecondary = new Map<string, ExtractedCompanyCandidate>();
  for (const c of list) {
    const sk = secondaryDedupeKey(c.name);
    const key = sk.length >= 4 ? sk : normalizeForCompareKey(c.name);
    const existing = bySecondary.get(key);
    if (!existing) {
      bySecondary.set(key, c);
      continue;
    }
    bySecondary.set(key, pickBetter(existing, c));
  }

  return [...bySecondary.values()];
}

function pickBetter(a: ExtractedCompanyCandidate, b: ExtractedCompanyCandidate): ExtractedCompanyCandidate {
  const score = (x: ExtractedCompanyCandidate) =>
    methodRank(x.method) * 1000 +
    (x.containerScore ?? 0) * 10 +
    x.confidence +
    (x.detailUrl ? 50 : 0) +
    (x.listingUrl ? 20 : 0) +
    (x.sourceText && x.sourceText.length > 10 ? 5 : 0);

  return score(b) > score(a) ? b : a;
}
