import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { prismaAccountToDomain } from '@/lib/lead-generation/db-mappers';
import { buildLeadGenIdentity } from '@/lib/lead-generation/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?marketId=&country=&reviewState=&leadPipelineStage=&sourceType=&q= */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get('marketId') ?? undefined;
  const country = searchParams.get('country') ?? undefined;
  const reviewState = searchParams.get('reviewState') ?? undefined;
  const leadPipelineStage = searchParams.get('leadPipelineStage') ?? undefined;
  const sourceType = searchParams.get('sourceType') ?? undefined;
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? '200')));
  const q = searchParams.get('q')?.trim().toLowerCase();

  const where: Prisma.LeadGenAccountWhereInput = {};
  if (marketId) where.marketId = marketId;
  if (country) where.country = country;
  if (reviewState) where.reviewState = reviewState;
  if (leadPipelineStage) where.leadPipelineStage = leadPipelineStage;
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

  const paginate = Boolean(cursor) || searchParams.has('limit');
  const rows = await prisma.leadGenAccount.findMany({
    where,
    orderBy: { id: 'asc' },
    take: paginate ? limit + 1 : 2000,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  if (!paginate) {
    return NextResponse.json(rows.map(prismaAccountToDomain));
  }

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    items: page.map(prismaAccountToDomain),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  });
}

/** POST single account { marketId, name, ... } */
export async function POST(request: NextRequest) {
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
  const domain = typeof body.domain === 'string' ? body.domain : '';
  const website = typeof body.website === 'string' ? body.website : '';
  const identity = buildLeadGenIdentity({ name, domain, website });

  const a = await prisma.leadGenAccount.create({
    data: {
      marketId,
      name,
      normalizedName: identity.normalizedName,
      domain,
      normalizedDomain: identity.normalizedDomain,
      website,
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
    } as any,
  });

  return NextResponse.json(prismaAccountToDomain(a), { status: 201 });
}
