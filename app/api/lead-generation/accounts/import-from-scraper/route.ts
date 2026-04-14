import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/directory-scraper/job-store';
import { prisma } from '@/lib/prisma';
import { buildAccountCreateData } from '@/lib/lead-generation/scraper-import';
import { prismaAccountToDomain } from '@/lib/lead-generation/db-mappers';
import { normalizeDomain } from '@/lib/lead-generation/adapters';
import { seedLeadGenIfEmpty } from '@/lib/lead-generation/seed-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportBody = {
  jobId: string;
  marketId: string;
  resultIds?: string[];
  defaultCountry?: string;
  skipDuplicates?: boolean;
};

/**
 * Import directory scrape results into Lead Gen accounts for a market.
 */
export async function POST(request: NextRequest) {
  await seedLeadGenIfEmpty();

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

  const skipDuplicates = body.skipDuplicates !== false;
  const defaultCountry = typeof body.defaultCountry === 'string' ? body.defaultCountry : undefined;
  const idFilter = Array.isArray(body.resultIds) && body.resultIds.length > 0 ? new Set(body.resultIds) : null;

  let results = job.results ?? [];
  if (idFilter) results = results.filter((r) => idFilter.has(r.id));
  results = results.filter((r) => r.status !== 'failed');

  const existingPairs = skipDuplicates
    ? await prisma.leadGenAccount.findMany({
        where: { marketId, directoryJobId: jobId },
        select: { directoryResultId: true, domain: true },
      })
    : [];

  const pairSet = new Set(
    existingPairs.map((e) => `${e.directoryResultId ?? ''}:${normalizeDomain(e.domain)}`),
  );

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdAccounts: ReturnType<typeof prismaAccountToDomain>[] = [];

  for (const r of results) {
    const domain = normalizeDomain(r.companyWebsite || null);
    const key = `${r.id}:${domain}`;
    if (skipDuplicates && pairSet.has(key)) {
      skipped += 1;
      continue;
    }
    if (skipDuplicates && r.id && existingPairs.some((e) => e.directoryResultId === r.id)) {
      skipped += 1;
      continue;
    }

    try {
      const data = buildAccountCreateData({ marketId, jobId, result: r, defaultCountry });
      const a = await prisma.leadGenAccount.create({ data });
      created += 1;
      pairSet.add(key);
      createdAccounts.push(prismaAccountToDomain(a));
    } catch (e) {
      errors.push(`${r.companyName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    created,
    skipped,
    errors: errors.slice(0, 20),
    accounts: createdAccounts.slice(0, 50),
  });
}
