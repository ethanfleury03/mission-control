import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { prismaAccountToDomain } from '@/lib/lead-generation/db-mappers';
import { seedLeadGenIfEmpty } from '@/lib/lead-generation/seed-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?marketId=&country=&reviewState=&sourceType=&q= */
export async function GET(request: NextRequest) {
  await seedLeadGenIfEmpty();
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get('marketId') ?? undefined;
  const country = searchParams.get('country') ?? undefined;
  const reviewState = searchParams.get('reviewState') ?? undefined;
  const sourceType = searchParams.get('sourceType') ?? undefined;
  const q = searchParams.get('q')?.trim().toLowerCase();

  const where: Prisma.LeadGenAccountWhereInput = {};
  if (marketId) where.marketId = marketId;
  if (country) where.country = country;
  if (reviewState) where.reviewState = reviewState;
  if (sourceType) where.sourceType = sourceType;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { domain: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { industry: { contains: q } },
    ];
  }

  const rows = await prisma.leadGenAccount.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 2000,
  });

  return NextResponse.json(rows.map(prismaAccountToDomain));
}

/** POST single account { marketId, name, ... } */
export async function POST(request: NextRequest) {
  await seedLeadGenIfEmpty();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const marketId = typeof body.marketId === 'string' ? body.marketId : '';
  if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

  const market = await prisma.leadGenMarket.findUnique({ where: { id: marketId } });
  if (!market) return NextResponse.json({ error: 'market not found' }, { status: 404 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const a = await prisma.leadGenAccount.create({
    data: {
      marketId,
      name,
      domain: typeof body.domain === 'string' ? body.domain : '',
      website: typeof body.website === 'string' ? body.website : '',
      email: typeof body.email === 'string' ? body.email : '',
      phone: typeof body.phone === 'string' ? body.phone : '',
      country: typeof body.country === 'string' ? body.country : 'Unknown',
      region: typeof body.region === 'string' ? body.region : '',
      industry: typeof body.industry === 'string' ? body.industry : '',
      subindustry: typeof body.subindustry === 'string' ? body.subindustry : '',
      companySizeBand: typeof body.companySizeBand === 'string' ? body.companySizeBand : 'unknown',
      revenueBand: typeof body.revenueBand === 'string' ? body.revenueBand : 'unknown',
      description: typeof body.description === 'string' ? body.description : '',
      sourceType: typeof body.sourceType === 'string' ? body.sourceType : 'manual_upload',
      sourceName: typeof body.sourceName === 'string' ? body.sourceName : '',
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : '',
      status: typeof body.status === 'string' ? body.status : 'prospect',
      fitScore: typeof body.fitScore === 'number' ? body.fitScore : 0,
      fitSummary: typeof body.fitSummary === 'string' ? body.fitSummary : '',
      assignedOwner: typeof body.assignedOwner === 'string' ? body.assignedOwner : '',
      reviewState: typeof body.reviewState === 'string' ? body.reviewState : 'new',
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json(prismaAccountToDomain(a), { status: 201 });
}
