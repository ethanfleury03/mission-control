/**
 * Idempotent seed of Lead Gen markets + demo accounts (first run after schema add).
 */
import { prisma } from '@/lib/prisma';
import { SEED_MARKETS, SEED_ACCOUNTS } from './mock-data';

export async function seedLeadGenIfEmpty(): Promise<{ seededMarkets: number; seededAccounts: number }> {
  const existing = await prisma.leadGenMarket.count();
  if (existing > 0) {
    return { seededMarkets: 0, seededAccounts: 0 };
  }

  const idByLegacyId = new Map<string, string>();

  for (const m of SEED_MARKETS) {
    const created = await prisma.leadGenMarket.create({
      data: {
        slug: m.slug,
        name: m.name,
        description: m.description,
        countriesJson: JSON.stringify(m.countries),
        personasJson: JSON.stringify(m.targetPersonas),
        solutionAreasJson: JSON.stringify(m.solutionAreas),
        status: m.status,
        notes: m.notes,
      },
    });
    idByLegacyId.set(m.id, created.id);
  }

  let accounts = 0;
  for (const a of SEED_ACCOUNTS) {
    const marketId = idByLegacyId.get(a.marketId);
    if (!marketId) continue;
    await prisma.leadGenAccount.create({
      data: {
        marketId,
        name: a.name,
        domain: a.domain,
        website: a.website,
        country: a.country,
        region: a.region,
        industry: a.industry,
        subindustry: a.subindustry,
        companySizeBand: a.companySizeBand,
        revenueBand: a.revenueBand,
        description: a.description,
        sourceType: a.sourceType,
        sourceName: a.sourceName,
        sourceUrl: a.sourceUrl,
        status: a.status,
        fitScore: a.fitScore,
        fitSummary: a.fitSummary,
        assignedOwner: a.assignedOwner,
        reviewState: a.reviewState,
        lastSeenAt: new Date(a.lastSeenAt),
      },
    });
    accounts += 1;
  }

  return { seededMarkets: SEED_MARKETS.length, seededAccounts: accounts };
}
