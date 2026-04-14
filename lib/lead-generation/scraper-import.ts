import type { CompanyResult } from '@/lib/directory-scraper/types';
import { buildFitSummary, mapScrapedCompanyToAccountCandidate, normalizeDomain } from './adapters';
import type { ScrapedCompanyCandidate } from './adapters';

export function companyResultToScrapedCandidate(r: CompanyResult, jobId: string): ScrapedCompanyCandidate {
  const website = r.companyWebsite?.trim() || '';
  const domain = normalizeDomain(website || null);
  const parts = [r.notes, r.contactName && `Contact: ${r.contactName}`, r.email && `Email: ${r.email}`].filter(Boolean);
  return {
    rawName: r.companyName,
    rawDomain: domain || null,
    rawWebsite: website || (domain ? `https://${domain}` : null),
    rawCountry: null,
    rawIndustry: null,
    rawDescription: parts.join(' · ') || null,
    rawEmployeeCount: null,
    rawRevenue: null,
    sourceType: 'internal_scraper',
    sourceName: 'Directory scraper',
    sourceUrl: r.directoryListingUrl || '',
    scrapedAt: new Date().toISOString(),
    rawPayload: { jobId, resultId: r.id, confidence: r.confidence, status: r.status },
  };
}

export type ImportAccountInput = {
  marketId: string;
  jobId: string;
  result: CompanyResult;
  defaultCountry?: string;
};

/** Build Prisma create payload from a directory scrape row. */
export function buildAccountCreateData(input: ImportAccountInput) {
  const { marketId, jobId, result, defaultCountry } = input;
  const candidate = companyResultToScrapedCandidate(result, jobId);
  const mapped = mapScrapedCompanyToAccountCandidate(candidate, marketId);

  const domain = mapped.domain ?? '';
  const website = mapped.website ?? (domain ? `https://${domain}` : '');
  const country = defaultCountry?.trim() || mapped.country || 'Unknown';

  const reviewState =
    result.needsReview || result.confidence === 'low' ? 'needs_review' : 'new';

  const description =
    [mapped.description, result.address && `Address: ${result.address}`].filter(Boolean).join('\n') || '';

  return {
    marketId,
    name: mapped.name ?? result.companyName,
    domain,
    website,
    country,
    region: mapped.region ?? '',
    industry: mapped.industry ?? '',
    subindustry: '',
    companySizeBand: mapped.companySizeBand ?? 'unknown',
    revenueBand: 'unknown',
    description,
    sourceType: 'internal_scraper',
    sourceName: 'Directory scraper',
    sourceUrl: result.directoryListingUrl ?? '',
    directoryJobId: jobId,
    directoryResultId: result.id,
    status: 'prospect' as const,
    fitScore: 0,
    fitSummary: buildFitSummary({ ...mapped, country, industry: mapped.industry }),
    assignedOwner: '',
    reviewState,
    lastSeenAt: new Date(),
  };
}
