import type { CompanyResult } from '@/lib/directory-scraper/types';
import { pickBestEmail } from '@/lib/directory-scraper/utils';
import { buildFitSummary, mapScrapedCompanyToAccountCandidate, normalizeDomain } from './adapters';
import type { ScrapedCompanyCandidate } from './adapters';

/** Top-level fields are canonical; fall back to rawContact when enrichment only filled that blob. */
export function pickEmailFromScrapeResult(result: CompanyResult): string {
  const direct = (result.email ?? '').trim();
  if (direct) return direct;
  const emails = result.rawContact?.emails?.filter((e): e is string => Boolean(e?.trim())) ?? [];
  if (emails.length === 0) return '';
  const host = normalizeDomain(result.companyWebsite || null);
  return pickBestEmail(emails, host || undefined).trim();
}

export function pickPhoneFromScrapeResult(result: CompanyResult): string {
  const direct = (result.phone ?? '').trim();
  if (direct) return direct;
  const phones = result.rawContact?.phones?.filter((p): p is string => Boolean(p?.trim())) ?? [];
  return (phones[0] ?? '').trim();
}

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
    email: pickEmailFromScrapeResult(result),
    phone: pickPhoneFromScrapeResult(result),
    status: 'prospect' as const,
    fitScore: 0,
    fitSummary: buildFitSummary({ ...mapped, country, industry: mapped.industry }),
    assignedOwner: '',
    reviewState,
    lastSeenAt: new Date(),
  };
}
