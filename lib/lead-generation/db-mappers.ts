import type { LeadGenAccount as PrismaAccount, LeadGenMarket as PrismaMarket } from '@prisma/client';
import type { Account, LeadPipelineStage, Market, MarketStatus } from './types';

const MARKET_STATUSES: MarketStatus[] = ['active', 'building', 'planned', 'archived'];
const PIPELINE_STAGES: import('./types').LeadPipelineStage[] = [
  'discovered',
  'triaged_ok',
  'triaged_hold',
  'rejected',
  'pushed_to_hubspot',
  'push_failed',
];

function parseJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function prismaMarketToDomain(m: PrismaMarket, companyCount: number): Market {
  const status = MARKET_STATUSES.includes(m.status as MarketStatus) ? (m.status as MarketStatus) : 'active';
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    description: m.description,
    countries: parseJsonArray(m.countriesJson),
    targetPersonas: parseJsonArray(m.personasJson),
    solutionAreas: parseJsonArray(m.solutionAreasJson),
    status,
    notes: m.notes,
    companyCount,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function parsePipelineStage(s: string | null | undefined): LeadPipelineStage {
  const v = (s ?? 'discovered').trim();
  return PIPELINE_STAGES.includes(v as LeadPipelineStage) ? (v as LeadPipelineStage) : 'discovered';
}

export function prismaAccountToDomain(a: PrismaAccount): Account {
  return {
    id: a.id,
    marketId: a.marketId,
    name: a.name,
    domain: a.domain,
    website: a.website,
    email: a.email ?? '',
    phone: a.phone ?? '',
    country: a.country,
    region: a.region,
    industry: a.industry,
    subindustry: a.subindustry,
    companySizeBand: a.companySizeBand as Account['companySizeBand'],
    revenueBand: a.revenueBand as Account['revenueBand'],
    description: a.description,
    sourceType: a.sourceType as Account['sourceType'],
    sourceName: a.sourceName,
    sourceUrl: a.sourceUrl,
    status: a.status as Account['status'],
    fitScore: a.fitScore,
    fitSummary: a.fitSummary,
    assignedOwner: a.assignedOwner,
    reviewState: a.reviewState as Account['reviewState'],
    leadPipelineStage: parsePipelineStage(a.leadPipelineStage),
    hubspotContactId: a.hubspotContactId ?? null,
    hubspotPushedAt: a.hubspotPushedAt?.toISOString() ?? null,
    hubspotPushedBy: a.hubspotPushedBy ?? '',
    hubspotLastPushError: a.hubspotLastPushError ?? '',
    lastSeenAt: (a.lastSeenAt ?? a.updatedAt).toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
