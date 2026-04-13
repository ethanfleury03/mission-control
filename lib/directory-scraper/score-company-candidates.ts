import type { ExtractedCompanyCandidate } from './types';
import { MENU_JUNK } from './name-extraction-constants';

const ORG_SUFFIX = /\b(inc\.?|llc|l\.l\.c\.?|ltd\.?|co\.?|corp\.?|corporation|company|group|industries|solutions|partners|systems|manufacturing|packaging|media|press|printing)\b/i;

const US_STATE = new Set([
  'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi',
  'mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut',
  'vt','va','wa','wv','wi','wy','dc',
]);

export interface LikelyOrgResult {
  ok: boolean;
  score: number;
  reasons: string[];
}

export function isLikelyOrganizationName(text: string, context?: { hasExternalLink?: boolean }): LikelyOrgResult {
  const t = text.trim();
  const reasons: string[] = [];
  let score = 0;

  if (t.length < 2 || t.length > 180) return { ok: false, score: -100, reasons: ['length'] };
  const lower = t.toLowerCase();
  if (MENU_JUNK.has(lower)) return { ok: false, score: -100, reasons: ['menu-junk'] };

  const wordCount = t.split(/\s+/).length;
  if (wordCount > 14) {
    reasons.push('long-phrase');
    score -= 25;
  }

  if (/^(next|prev|previous|page|\d+)$/i.test(t)) return { ok: false, score: -100, reasons: ['pagination'] };

  if (ORG_SUFFIX.test(t)) {
    score += 25;
    reasons.push('org-suffix');
  }

  if (/[A-Z][a-z]+(\s+[A-Z][a-z]+)+/.test(t) && wordCount <= 8) {
    score += 12;
    reasons.push('title-case');
  }

  if (context?.hasExternalLink) {
    score += 15;
    reasons.push('external-link');
  }

  if (/^\d+$/.test(t)) return { ok: false, score: -100, reasons: ['numeric'] };

  const firstWord = lower.split(/\s+/)[0];
  if (firstWord && US_STATE.has(firstWord) && wordCount <= 3) {
    score -= 20;
    reasons.push('maybe-location');
  }

  if (/[.!?]$/.test(t) && wordCount > 6) {
    score -= 15;
    reasons.push('sentence-like');
  }

  const ok = score >= 5 || ORG_SUFFIX.test(t) || (wordCount <= 6 && t.length >= 3 && !MENU_JUNK.has(lower));
  return { ok, score, reasons };
}

export function scoreCompanyCandidate(
  c: ExtractedCompanyCandidate,
  fullPageText: string,
): { score: number; reasons: string[] } {
  const base = isLikelyOrganizationName(c.name, {
    hasExternalLink: !!(c.companyWebsiteHint || (c.detailUrl && c.detailUrl !== c.listingUrl)),
  });
  let score = c.confidence + base.score + Math.min(30, (c.containerScore ?? 0) / 3);
  const reasons = [...c.reasons, ...base.reasons];

  if (c.method === 'jsonld' || c.method === 'microdata') score += 20;
  if (c.method === 'table') score += 12;
  if (c.method === 'detail-link') score += 8;

  return { score, reasons };
}
