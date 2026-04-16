// ---------------------------------------------------------------------------
// Lead Generation – Ingestion Adapters & Utilities
// ---------------------------------------------------------------------------
// Real scaffolding for future scraper/data integration.
// These are functional stubs that define the contract and basic transformations.
// ---------------------------------------------------------------------------

import type { Account, SourceType, ReviewState, CompanySizeBand, IngestionItem } from './types';
import { normalizeLeadGenDomain } from './identity';

// ── Scraped Company Candidate ───────────────────────────────────────────────

export interface ScrapedCompanyCandidate {
  rawName: string;
  rawDomain: string | null;
  rawWebsite: string | null;
  rawCountry: string | null;
  rawIndustry: string | null;
  rawDescription: string | null;
  rawEmployeeCount: number | null;
  rawRevenue: string | null;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl: string;
  scrapedAt: string;
  rawPayload: Record<string, unknown>;
}

// ── Lead Source Adapter Interface ────────────────────────────────────────────

export interface LeadSourceAdapter {
  name: string;
  sourceType: SourceType;
  normalize(raw: ScrapedCompanyCandidate): Partial<Account>;
  validate(candidate: Partial<Account>): { valid: boolean; issues: string[] };
}

// ── Domain Normalization ────────────────────────────────────────────────────

export function normalizeDomain(input: string | null | undefined): string {
  return normalizeLeadGenDomain(input);
}

// ── Country Normalization ───────────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  ca: 'Canada', can: 'Canada', canada: 'Canada',
  in: 'India', ind: 'India', india: 'India',
  it: 'Italy', ita: 'Italy', italy: 'Italy', italia: 'Italy',
  mx: 'Mexico', mex: 'Mexico', mexico: 'Mexico', méxico: 'Mexico',
  us: 'United States', usa: 'United States', 'united states': 'United States',
  gb: 'United Kingdom', uk: 'United Kingdom', 'united kingdom': 'United Kingdom',
  de: 'Germany', deu: 'Germany', germany: 'Germany', deutschland: 'Germany',
  fr: 'France', fra: 'France', france: 'France',
  br: 'Brazil', bra: 'Brazil', brazil: 'Brazil', brasil: 'Brazil',
};

export function normalizeCountry(input: string | null | undefined): string {
  if (!input) return 'Unknown';
  const key = input.trim().toLowerCase();
  return COUNTRY_ALIASES[key] ?? input.trim();
}

// ── Company Size Band Inference ─────────────────────────────────────────────

export function inferSizeBand(employeeCount: number | null | undefined): CompanySizeBand {
  if (!employeeCount) return 'unknown';
  if (employeeCount < 50) return 'small';
  if (employeeCount < 500) return 'mid-market';
  return 'enterprise';
}

// ── Map Scraped Company to Account Candidate ────────────────────────────────

let candidateIdCounter = 0;

export function mapScrapedCompanyToAccountCandidate(
  candidate: ScrapedCompanyCandidate,
  marketId: string,
): Partial<Account> {
  candidateIdCounter += 1;
  const domain = normalizeDomain(candidate.rawDomain ?? candidate.rawWebsite);

  return {
    id: `candidate-${candidateIdCounter}`,
    marketId,
    name: candidate.rawName.trim(),
    domain,
    website: candidate.rawWebsite ?? (domain ? `https://${domain}` : ''),
    country: normalizeCountry(candidate.rawCountry),
    region: '',
    industry: candidate.rawIndustry ?? '',
    subindustry: '',
    companySizeBand: inferSizeBand(candidate.rawEmployeeCount),
    revenueBand: 'unknown',
    description: candidate.rawDescription ?? '',
    sourceType: candidate.sourceType,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    status: 'prospect',
    fitScore: 0,
    fitSummary: '',
    assignedOwner: '',
    reviewState: 'new' as ReviewState,
    lastSeenAt: candidate.scrapedAt,
    createdAt: candidate.scrapedAt,
    updatedAt: candidate.scrapedAt,
  };
}

// ── Build Fit Summary (placeholder) ─────────────────────────────────────────

export function buildFitSummary(account: Partial<Account>): string {
  const parts: string[] = [];
  if (account.industry) parts.push(`Industry: ${account.industry}`);
  if (account.country) parts.push(`Geography: ${account.country}`);
  if (account.companySizeBand && account.companySizeBand !== 'unknown') {
    parts.push(`Size: ${account.companySizeBand}`);
  }
  if (parts.length === 0) return 'Insufficient data for fit assessment';
  return `Preliminary assessment based on: ${parts.join(', ')}. Full scoring pending.`;
}

// ── Ingestion Service Interface ─────────────────────────────────────────────

export interface IngestionResult {
  totalProcessed: number;
  created: number;
  updated: number;
  duplicates: number;
  rejected: number;
  errors: string[];
}

export interface IngestionService {
  ingest(
    sourceId: string,
    candidates: ScrapedCompanyCandidate[],
    marketId: string,
  ): Promise<IngestionResult>;
}

// ── Stub Ingestion Service ──────────────────────────────────────────────────

export class StubIngestionService implements IngestionService {
  async ingest(
    _sourceId: string,
    candidates: ScrapedCompanyCandidate[],
    marketId: string,
  ): Promise<IngestionResult> {
    const results: IngestionResult = {
      totalProcessed: candidates.length,
      created: 0,
      updated: 0,
      duplicates: 0,
      rejected: 0,
      errors: [],
    };

    for (const candidate of candidates) {
      try {
        const mapped = mapScrapedCompanyToAccountCandidate(candidate, marketId);
        const validation = validateCandidate(mapped);
        if (validation.valid) {
          results.created += 1;
        } else {
          results.rejected += 1;
        }
      } catch (err) {
        results.errors.push(`Failed to process ${candidate.rawName}: ${String(err)}`);
      }
    }

    return results;
  }
}

// ── Candidate Validation ────────────────────────────────────────────────────

function validateCandidate(candidate: Partial<Account>): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!candidate.name) issues.push('Missing company name');
  if (!candidate.domain && !candidate.website) issues.push('Missing domain or website');
  if (!candidate.country || candidate.country === 'Unknown') issues.push('Unknown country');
  return { valid: issues.length === 0, issues };
}

// ── CSV Import Adapter (stub) ───────────────────────────────────────────────

export const csvImportAdapter: LeadSourceAdapter = {
  name: 'CSV Import',
  sourceType: 'manual_upload',
  normalize(raw: ScrapedCompanyCandidate): Partial<Account> {
    return mapScrapedCompanyToAccountCandidate(raw, '');
  },
  validate(candidate: Partial<Account>) {
    return validateCandidate(candidate);
  },
};

// ── Scraper Adapter (stub for future integration) ───────────────────────────

export const scraperAdapter: LeadSourceAdapter = {
  name: 'Internal Scraper',
  sourceType: 'internal_scraper',
  normalize(raw: ScrapedCompanyCandidate): Partial<Account> {
    return mapScrapedCompanyToAccountCandidate(raw, '');
  },
  validate(candidate: Partial<Account>) {
    return validateCandidate(candidate);
  },
};
