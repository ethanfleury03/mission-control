import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/directory-scraper/job-store';
import { prisma } from '@/lib/prisma';
import { prismaAccountToDomain } from '@/lib/lead-generation/db-mappers';
import {
  buildAccountCreateData,
  buildManualWinsMerge,
  buildScraperImportLookupKey,
  type ExistingAccountForImport,
} from '@/lib/lead-generation/scraper-import';
import { normalizeLeadGenCountryKey } from '@/lib/lead-generation/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportBody = {
  jobId: string;
  marketId: string;
  resultIds?: string[];
  defaultCountry?: string;
  skipDuplicates?: boolean;
};

type MergeOutcome = 'created' | 'updated' | 'skipped_duplicate' | 'conflict' | 'error';

function nameCountryKey(name: string | null | undefined, country: string | null | undefined) {
  const normalized = buildScraperImportLookupKey({ name: name ?? '', country: country ?? null });
  return `${normalized.normalizedName}|${normalized.countryKey}`;
}

function pushMapValue<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

async function createIngestionEvent(data: {
  marketId: string;
  accountId?: string | null;
  directoryJobId: string;
  directoryResultId: string;
  mergeOutcome: MergeOutcome;
  conflictFields?: string[];
  details?: Record<string, unknown>;
}) {
  const prismaAny = prisma as any;
  await prismaAny.leadGenIngestionEvent.create({
    data: {
      marketId: data.marketId,
      accountId: data.accountId ?? null,
      directoryJobId: data.directoryJobId,
      directoryResultId: data.directoryResultId,
      mergeOutcome: data.mergeOutcome,
      conflictFieldsJson: JSON.stringify(data.conflictFields ?? []),
      detailsJson: JSON.stringify(data.details ?? {}),
    },
  });
}

/**
 * Import directory scrape results into Lead Gen accounts for a market.
 * Match order inside a market:
 * 1. directoryResultId
 * 2. normalizedDomain
 * 3. normalizedName + country (only when domain missing)
 * 4. create new
 */
export async function POST(request: NextRequest) {
  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { jobId, marketId } = body;
  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }
  if (!marketId || typeof marketId !== 'string') {
    return NextResponse.json({ error: 'marketId is required' }, { status: 400 });
  }

  const market = await prisma.leadGenMarket.findUnique({ where: { id: marketId } });
  if (!market) return NextResponse.json({ error: 'market not found' }, { status: 404 });

  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: 'scrape job not found' }, { status: 404 });

  const defaultCountry = typeof body.defaultCountry === 'string' ? body.defaultCountry : undefined;
  const idFilter = Array.isArray(body.resultIds) && body.resultIds.length > 0 ? new Set(body.resultIds) : null;
  let results = job.results ?? [];
  if (idFilter) results = results.filter((result) => idFilter.has(result.id));
  results = results.filter((result) => result.status !== 'failed');

  const candidates = results.map((result) => {
    const incoming = buildAccountCreateData({ marketId, jobId, result, defaultCountry });
    const lookup = buildScraperImportLookupKey({
      name: incoming.name,
      domain: incoming.domain,
      website: incoming.website,
      country: incoming.country,
    });
    return { result, incoming, lookup };
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      created: 0,
      updated: 0,
      skipped: 0,
      conflicts: 0,
      errors: [],
      accounts: [],
    });
  }

  const resultIds = candidates.map((candidate) => candidate.result.id);
  const domains = [...new Set(candidates.map((candidate) => candidate.lookup.normalizedDomain).filter(Boolean))];
  const normalizedNames = [
    ...new Set(candidates.map((candidate) => candidate.lookup.normalizedName).filter(Boolean)),
  ];
  const countries = [...new Set(candidates.map((candidate) => candidate.incoming.country).filter(Boolean))];

  const existingRows = await prisma.leadGenAccount.findMany({
    where: {
      marketId,
      OR: [
        resultIds.length > 0 ? { directoryResultId: { in: resultIds } } : undefined,
        domains.length > 0 ? { normalizedDomain: { in: domains } } : undefined,
        normalizedNames.length > 0
          ? { normalizedName: { in: normalizedNames }, country: { in: countries } }
          : undefined,
      ].filter(Boolean) as any,
    },
    orderBy: { createdAt: 'asc' },
  });

  const existingByResultId = new Map<string, ExistingAccountForImport>();
  const existingByDomain = new Map<string, ExistingAccountForImport[]>();
  const existingByNameCountry = new Map<string, ExistingAccountForImport[]>();

  for (const row of existingRows as unknown as ExistingAccountForImport[]) {
    if (row.directoryResultId) existingByResultId.set(row.directoryResultId, row);
    if (row.normalizedDomain) pushMapValue(existingByDomain, row.normalizedDomain, row);
    pushMapValue(existingByNameCountry, nameCountryKey(row.normalizedName ?? row.name, row.country), row);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;
  const errors: string[] = [];
  const sampleAccounts: ReturnType<typeof prismaAccountToDomain>[] = [];

  const pushSample = (account: ReturnType<typeof prismaAccountToDomain>) => {
    if (sampleAccounts.length < 50) sampleAccounts.push(account);
  };

  for (const candidate of candidates) {
    const { result, incoming, lookup } = candidate;

    const byResult = existingByResultId.get(result.id);
    const byDomain = lookup.normalizedDomain ? existingByDomain.get(lookup.normalizedDomain)?.[0] : undefined;
    const byNameCountry =
      !lookup.normalizedDomain
        ? existingByNameCountry.get(`${lookup.normalizedName}|${lookup.countryKey}`)?.[0]
        : undefined;

    const existing = byResult ?? byDomain ?? byNameCountry;
    const matchStrategy = byResult
      ? 'directoryResultId'
      : byDomain
        ? 'normalizedDomain'
        : byNameCountry
          ? 'normalizedNameCountry'
          : 'created';

    try {
      if (!existing) {
        const createdRow = await prisma.leadGenAccount.create({ data: incoming as any });
        created += 1;
        const domain = incoming.normalizedDomain;
        const createdAccount = createdRow as unknown as ExistingAccountForImport;
        existingByResultId.set(result.id, createdAccount);
        if (domain) pushMapValue(existingByDomain, domain, createdAccount);
        pushMapValue(
          existingByNameCountry,
          `${incoming.normalizedName}|${normalizeLeadGenCountryKey(incoming.country)}`,
          createdAccount,
        );
        await createIngestionEvent({
          marketId,
          accountId: createdRow.id,
          directoryJobId: jobId,
          directoryResultId: result.id,
          mergeOutcome: 'created',
          details: { matchStrategy },
        });
        pushSample(prismaAccountToDomain(createdRow));
        continue;
      }

      const merge = buildManualWinsMerge(existing, incoming);
      const didFillFields = merge.filledFields.length > 0;
      const hasConflicts = merge.conflicts.length > 0;
      const mergeOutcome: MergeOutcome = hasConflicts
        ? 'conflict'
        : didFillFields || existing.directoryResultId !== incoming.directoryResultId
          ? 'updated'
          : 'skipped_duplicate';

      const updatedRow = await prisma.leadGenAccount.update({
        where: { id: existing.id },
        data: merge.data as any,
      });

      if (mergeOutcome === 'conflict') conflicts += 1;
      else if (mergeOutcome === 'updated') updated += 1;
      else skipped += 1;

      await createIngestionEvent({
        marketId,
        accountId: existing.id,
        directoryJobId: jobId,
        directoryResultId: result.id,
        mergeOutcome,
        conflictFields: merge.conflicts,
        details: {
          matchStrategy,
          filledFields: merge.filledFields,
        },
      });

      existingByResultId.set(result.id, updatedRow as unknown as ExistingAccountForImport);
      if (lookup.normalizedDomain) {
        pushMapValue(existingByDomain, lookup.normalizedDomain, updatedRow as unknown as ExistingAccountForImport);
      }
      pushMapValue(
        existingByNameCountry,
        `${incoming.normalizedName}|${normalizeLeadGenCountryKey(incoming.country)}`,
        updatedRow as unknown as ExistingAccountForImport,
      );
      pushSample(prismaAccountToDomain(updatedRow));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${result.companyName}: ${message}`);
      await createIngestionEvent({
        marketId,
        accountId: undefined,
        directoryJobId: jobId,
        directoryResultId: result.id,
        mergeOutcome: 'error',
        details: { error: message, matchStrategy },
      });
    }
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    conflicts,
    errors: errors.slice(0, 20),
    accounts: sampleAccounts,
  });
}
