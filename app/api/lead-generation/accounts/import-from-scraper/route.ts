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

  const resultIds = [...new Set(results.map((r) => r.id).filter(Boolean))] as string[];

  /** Accounts in this market already tied to these scrape rows — refresh on re-import (email/phone/website). */
  const existingByResultId = new Map<string, { id: string }>();
  if (skipDuplicates && resultIds.length > 0) {
    const rows = await prisma.leadGenAccount.findMany({
      where: { marketId, directoryResultId: { in: resultIds } },
      select: { id: true, directoryResultId: true },
    });
    for (const row of rows) {
      if (row.directoryResultId) existingByResultId.set(row.directoryResultId, { id: row.id });
    }
  }

  /** Same job+market already imported this domain+result combo (legacy dedupe when directoryResultId missing). */
  const domainResultKeys = new Set<string>();
  if (skipDuplicates) {
    const legacy = await prisma.leadGenAccount.findMany({
      where: { marketId, directoryJobId: jobId },
      select: { directoryResultId: true, domain: true },
    });
    for (const e of legacy) {
      domainResultKeys.add(`${e.directoryResultId ?? ''}:${normalizeDomain(e.domain)}`);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const sampleAccounts: ReturnType<typeof prismaAccountToDomain>[] = [];

  const pushSample = (a: ReturnType<typeof prismaAccountToDomain>) => {
    if (sampleAccounts.length < 50) sampleAccounts.push(a);
  };

  for (const r of results) {
    const domain = normalizeDomain(r.companyWebsite || null);
    const dedupeKey = `${r.id ?? ''}:${domain}`;
    if (skipDuplicates && domainResultKeys.has(dedupeKey) && !existingByResultId.has(r.id)) {
      skipped += 1;
      continue;
    }

    try {
      const data = buildAccountCreateData({ marketId, jobId, result: r, defaultCountry });
      const existingId = r.id ? existingByResultId.get(r.id)?.id : undefined;

      if (existingId) {
        const a = await prisma.leadGenAccount.update({
          where: { id: existingId },
          data: {
            directoryJobId: jobId,
            name: data.name,
            domain: data.domain,
            website: data.website,
            email: data.email,
            phone: data.phone,
            country: data.country,
            region: data.region,
            industry: data.industry,
            subindustry: data.subindustry,
            companySizeBand: data.companySizeBand,
            description: data.description,
            sourceUrl: data.sourceUrl,
            reviewState: data.reviewState,
            fitSummary: data.fitSummary,
            lastSeenAt: data.lastSeenAt,
          },
        });
        updated += 1;
        domainResultKeys.add(dedupeKey);
        pushSample(prismaAccountToDomain(a));
        continue;
      }

      const a = await prisma.leadGenAccount.create({ data });
      created += 1;
      if (r.id) existingByResultId.set(r.id, { id: a.id });
      domainResultKeys.add(dedupeKey);
      pushSample(prismaAccountToDomain(a));
    } catch (e) {
      errors.push(`${r.companyName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    errors: errors.slice(0, 20),
    accounts: sampleAccounts,
  });
}
