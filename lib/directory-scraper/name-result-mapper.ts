import type { CompanyResult, ConfidenceScore, ExtractedCompanyCandidate, NameExtractionMeta } from './types';
import { v4 as uuid } from 'uuid';

export function numericScoreToLabel(score: number): ConfidenceScore {
  if (score >= 62) return 'high';
  if (score >= 42) return 'medium';
  return 'low';
}

export function candidateToCompanyResult(
  c: ExtractedCompanyCandidate,
  index: number,
  options: { visitWebsites: boolean },
): CompanyResult {
  const listing = c.listingUrl ?? c.detailUrl ?? c.sourceUrl;
  const website =
    c.companyWebsiteHint && c.companyWebsiteHint.startsWith('http')
      ? c.companyWebsiteHint
      : c.companyWebsiteHint
        ? `https://${c.companyWebsiteHint.replace(/^https?:\/\//, '')}`
        : '';

  const label = numericScoreToLabel(c.confidence);
  const needsReview =
    label === 'low' ||
    c.method === 'plain-text' ||
    (c.method === 'ai-classified' && c.reasons.some((r) => r.includes('uncertain')));

  const meta: NameExtractionMeta = {
    normalizedName: c.normalizedName,
    extractionMethod: c.method,
    confidenceScore: Math.round(c.confidence),
    confidenceLabel: label,
    sourceSelector: c.sourceSelector,
    sourceText: c.sourceText ?? c.name,
    containerSelector: c.containerSelector,
    containerScore: c.containerScore,
    reasons: c.reasons,
    listingUrl: c.listingUrl,
    detailUrl: c.detailUrl,
    aiRefined: c.method === 'ai-classified' || c.reasons.some((r) => r.startsWith('ai:')),
  };

  return {
    id: uuid(),
    companyName: c.name,
    directoryListingUrl: listing,
    companyWebsite: website,
    contactName: '',
    email: '',
    phone: '',
    address: '',
    contactPageUrl: '',
    socialLinks: '',
    notes: c.reasons.join('; '),
    confidence: label,
    status: options.visitWebsites ? 'pending' : 'done',
    needsReview,
    sortOrder: index,
    nameExtractionMeta: meta,
  };
}
