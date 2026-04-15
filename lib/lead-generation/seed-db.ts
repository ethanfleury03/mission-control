/**
 * Idempotent seed of Lead Gen markets + demo accounts.
 * Uses upsert on markets + a promise chain lock so concurrent API requests don't race.
 */
import { prisma } from '@/lib/prisma';
import { SEED_MARKETS, SEED_ACCOUNTS } from './mock-data';

type SeedResult = { seededMarkets: number; seededAccounts: number };

/** Ensures only one performSeed runs at a time; others wait in FIFO order. */
let seedLock: Promise<void> = Promise.resolve();

async function performSeed(): Promise<SeedResult> {
  const idByLegacyId = new Map<string, string>();

  let marketsTouched = 0;
  for (const m of SEED_MARKETS) {
    const row = await prisma.leadGenMarket.upsert({
      where: { slug: m.slug },
      create: {
        slug: m.slug,
        name: m.name,
        description: m.description,
        countriesJson: JSON.stringify(m.countries),
        personasJson: JSON.stringify(m.targetPersonas),
        solutionAreasJson: JSON.stringify(m.solutionAreas),
        status: m.status,
        notes: m.notes,
      },
      update: {
        name: m.name,
        description: m.description,
        countriesJson: JSON.stringify(m.countries),
        personasJson: JSON.stringify(m.targetPersonas),
        solutionAreasJson: JSON.stringify(m.solutionAreas),
        status: m.status,
        notes: m.notes,
      },
    });
    idByLegacyId.set(m.id, row.id);
    marketsTouched += 1;
  }

  const accountCount = await prisma.leadGenAccount.count();
  if (accountCount > 0) {
    return { seededMarkets: marketsTouched, seededAccounts: 0 };
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
        email: a.email ?? '',
        phone: a.phone ?? '',
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

  return { seededMarkets: marketsTouched, seededAccounts: accounts };
}

export async function seedLeadGenIfEmpty(): Promise<SeedResult> {
  const result = seedLock.then(() => performSeed());
  seedLock = result.then(
    () => {},
    () => {},
  );
  return result;
}
