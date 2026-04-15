/**
 * Idempotent seed of Lead Gen markets + demo accounts.
 * Uses findUnique + create/update on markets (Turso + driver adapter can 400 on upsert)
 * and a promise chain lock so concurrent API requests don't race.
 */
import { prisma } from '@/lib/prisma';
import { SEED_MARKETS, SEED_ACCOUNTS } from './mock-data';

type SeedResult = { seededMarkets: number; seededAccounts: number };

/** Ensures only one performSeed runs at a time; others wait in FIFO order. */
let seedLock: Promise<void> = Promise.resolve();

async function performSeed(): Promise<SeedResult> {
  const idByLegacyId = new Map<string, string>();

  const marketData = (m: (typeof SEED_MARKETS)[number]) => ({
    name: m.name,
    description: m.description,
    countriesJson: JSON.stringify(m.countries),
    personasJson: JSON.stringify(m.targetPersonas),
    solutionAreasJson: JSON.stringify(m.solutionAreas),
    status: m.status,
    notes: m.notes,
  });

  let marketsTouched = 0;
  for (const m of SEED_MARKETS) {
    // Avoid prisma.upsert here: Turso + driver adapter can return HTTP 400 on UPSERT/RETURNING batches.
    const existing = await prisma.leadGenMarket.findUnique({ where: { slug: m.slug } });
    const row = existing
      ? await prisma.leadGenMarket.update({
          where: { slug: m.slug },
          data: marketData(m),
        })
      : await prisma.leadGenMarket.create({
          data: {
            slug: m.slug,
            ...marketData(m),
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
        leadPipelineStage: 'discovered',
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
