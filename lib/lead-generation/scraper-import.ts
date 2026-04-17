import type { CompanyResult } from '@/lib/directory-scraper/types';
import { pickBestEmail } from '@/lib/directory-scraper/utils';
import { buildFitSummary, mapScrapedCompanyToAccountCandidate } from './adapters';
import type { ScrapedCompanyCandidate } from './adapters';
import {
  buildLeadGenIdentity,
  normalizeLeadGenCompanyName,
  normalizeLeadGenCountryKey,
  normalizeLeadGenDomain,
} from './identity';

/** Top-level fields are canonical; fall back to rawContact when enrichment only filled that blob. */
export function pickEmailFromScrapeResult(result: CompanyResult): string {
  const direct = (result.email ?? '').trim();
  if (direct) return direct;
  const emails = result.rawContact?.emails?.filter((email): email is string => Boolean(email?.trim())) ?? [];
  if (emails.length === 0) return '';
  const host = normalizeLeadGenDomain(result.companyWebsite || null);
  return pickBestEmail(emails, host || undefined).trim();
}

export function pickPhoneFromScrapeResult(result: CompanyResult): string {
  const direct = (result.phone ?? '').trim();
  if (direct) return direct;
  const phones = result.rawContact?.phones?.filter((phone): phone is string => Boolean(phone?.trim())) ?? [];
  return (phones[0] ?? '').trim();
}

export function companyResultToScrapedCandidate(result: CompanyResult, jobId: string): ScrapedCompanyCandidate {
  const website = result.companyWebsite?.trim() || '';
  const domain = normalizeLeadGenDomain(website || null);
  const parts = [
    result.notes,
    result.contactName && `Contact: ${result.contactName}`,
    result.email && `Email: ${result.email}`,
  ].filter(Boolean);
  return {
    rawName: result.companyName,
    rawDomain: domain || null,
    rawWebsite: website || (domain ? `https://${domain}` : null),
    rawCountry: null,
    rawIndustry: null,
    rawDescription: parts.join(' · ') || null,
    rawEmployeeCount: null,
    rawRevenue: null,
    sourceType: 'internal_scraper',
    sourceName: 'Directory scraper',
    sourceUrl: result.directoryListingUrl || '',
    scrapedAt: new Date().toISOString(),
    rawPayload: { jobId, resultId: result.id, confidence: result.confidence, status: result.status },
  };
}

export type ImportAccountInput = {
  marketId: string;
  jobId: string;
  result: CompanyResult;
  defaultCountry?: string;
};

export interface ScraperAccountCreateData {
  marketId: string;
  name: string;
  normalizedName: string;
  domain: string;
  normalizedDomain: string;
  website: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  industry: string;
  subindustry: string;
  companySizeBand: string;
  revenueBand: string;
  description: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  directoryJobId: string;
  directoryResultId: string;
  status: 'prospect';
  fitScore: number;
  fitSummary: string;
  assignedOwner: string;
  reviewState: string;
  leadPipelineStage: 'discovered';
  lastSeenAt: Date;
}

/** Build Prisma create payload from a directory scrape row. */
export function buildAccountCreateData(input: ImportAccountInput): ScraperAccountCreateData {
  const { marketId, jobId, result, defaultCountry } = input;
  const candidate = companyResultToScrapedCandidate(result, jobId);
  const mapped = mapScrapedCompanyToAccountCandidate(candidate, marketId);

  const domain = mapped.domain ?? '';
  const website = mapped.website ?? (domain ? `https://${domain}` : '');
  const country = defaultCountry?.trim() || mapped.country || 'Unknown';
  const { normalizedDomain, normalizedName } = buildLeadGenIdentity({
    name: mapped.name ?? result.companyName,
    domain,
    website,
  });

  const reviewState = result.needsReview || result.confidence === 'low' ? 'needs_review' : 'new';
  const description =
    [mapped.description, result.address && `Address: ${result.address}`].filter(Boolean).join('\n') || '';

  return {
    marketId,
    name: mapped.name ?? result.companyName,
    normalizedName,
    domain,
    normalizedDomain,
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
    status: 'prospect',
    fitScore: 0,
    fitSummary: buildFitSummary({ ...mapped, country, industry: mapped.industry }),
    assignedOwner: '',
    reviewState,
    leadPipelineStage: 'discovered',
    lastSeenAt: new Date(),
  };
}

export type ExistingAccountForImport = {
  id: string;
  name: string;
  normalizedName?: string | null;
  domain: string;
  normalizedDomain?: string | null;
  website: string;
  email: string;
  phone: string;
  country: string;
  region: string;
  industry: string;
  subindustry: string;
  companySizeBand: string;
  revenueBand: string;
  description: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  directoryJobId?: string | null;
  directoryResultId?: string | null;
  fitSummary: string;
  reviewState: string;
};

type MergeField =
  | 'name'
  | 'domain'
  | 'website'
  | 'email'
  | 'phone'
  | 'country'
  | 'region'
  | 'industry'
  | 'subindustry'
  | 'companySizeBand'
  | 'revenueBand'
  | 'description'
  | 'fitSummary';

const MANUAL_WINS_FIELDS: MergeField[] = [
  'name',
  'domain',
  'website',
  'email',
  'phone',
  'country',
  'region',
  'industry',
  'subindustry',
  'companySizeBand',
  'revenueBand',
  'description',
  'fitSummary',
];

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export interface ManualWinsMergeResult {
  data: Record<string, unknown>;
  conflicts: MergeField[];
  filledFields: MergeField[];
}

export function buildManualWinsMerge(
  existing: ExistingAccountForImport,
  incoming: ScraperAccountCreateData,
): ManualWinsMergeResult {
  const data: Record<string, unknown> = {
    directoryJobId: incoming.directoryJobId,
    directoryResultId: incoming.directoryResultId,
    sourceType: incoming.sourceType,
    sourceName: incoming.sourceName,
    sourceUrl: incoming.sourceUrl,
    normalizedName: incoming.normalizedName || normalizeLeadGenCompanyName(existing.name),
    normalizedDomain: incoming.normalizedDomain || normalizeLeadGenDomain(existing.domain || existing.website),
    lastSeenAt: incoming.lastSeenAt,
  };

  const conflicts: MergeField[] = [];
  const filledFields: MergeField[] = [];

  for (const field of MANUAL_WINS_FIELDS) {
    const existingValue = existing[field];
    const incomingValue = incoming[field];
    if (isBlank(incomingValue)) continue;

    if (isBlank(existingValue)) {
      data[field] = incomingValue;
      filledFields.push(field);
      continue;
    }

    if (String(existingValue).trim() !== String(incomingValue).trim()) {
      conflicts.push(field);
    }
  }

  if (incoming.reviewState === 'needs_review' || conflicts.length > 0) {
    data.reviewState = 'needs_review';
  }

  return { data, conflicts, filledFields };
}

export function buildScraperImportLookupKey(input: {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  country?: string | null;
}) {
  const { normalizedName, normalizedDomain } = buildLeadGenIdentity(input);
  return {
    normalizedName,
    normalizedDomain,
    countryKey: normalizeLeadGenCountryKey(input.country),
  };
}
