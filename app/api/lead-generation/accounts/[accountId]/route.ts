import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaAccountToDomain } from '@/lib/lead-generation/db-mappers';
import { buildLeadGenIdentity } from '@/lib/lead-generation/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const a = await prisma.leadGenAccount.findUnique({ where: { id: accountId } });
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(prismaAccountToDomain(a));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  const existing = await prisma.leadGenAccount.findUnique({ where: { id: accountId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const str = (k: string) => (typeof body[k] === 'string' ? body[k] : undefined);
  const num = (k: string) => (typeof body[k] === 'number' ? body[k] : undefined);

  const nextName = str('name') ?? existing.name;
  const nextDomain = str('domain') !== undefined ? str('domain') ?? '' : existing.domain;
  const nextWebsite = str('website') !== undefined ? str('website') ?? '' : existing.website;
  const identity = buildLeadGenIdentity({ name: nextName, domain: nextDomain, website: nextWebsite });

  if (str('name')) data.name = str('name');
  data.normalizedName = identity.normalizedName;
  if (str('domain') !== undefined) data.domain = str('domain');
  data.normalizedDomain = identity.normalizedDomain;
  if (str('website') !== undefined) data.website = str('website');
  if (str('email') !== undefined) data.email = str('email');
  if (str('phone') !== undefined) data.phone = str('phone');
  if (str('country')) data.country = str('country');
  if (str('region') !== undefined) data.region = str('region');
  if (str('industry') !== undefined) data.industry = str('industry');
  if (str('subindustry') !== undefined) data.subindustry = str('subindustry');
  if (str('companySizeBand')) data.companySizeBand = str('companySizeBand');
  if (str('revenueBand')) data.revenueBand = str('revenueBand');
  if (str('description') !== undefined) data.description = str('description');
  if (str('sourceType')) data.sourceType = str('sourceType');
  if (str('sourceName') !== undefined) data.sourceName = str('sourceName');
  if (str('sourceUrl') !== undefined) data.sourceUrl = str('sourceUrl');
  if (str('status')) data.status = str('status');
  if (num('fitScore') !== undefined) data.fitScore = num('fitScore');
  if (str('fitSummary') !== undefined) data.fitSummary = str('fitSummary');
  if (str('assignedOwner') !== undefined) data.assignedOwner = str('assignedOwner');
  if (str('reviewState')) data.reviewState = str('reviewState');
  if (str('leadPipelineStage') !== undefined) {
    const s = str('leadPipelineStage');
    if (s !== undefined) data.leadPipelineStage = s;
  }
  if (str('marketId')) {
    const m = await prisma.leadGenMarket.findUnique({ where: { id: String(body.marketId) } });
    if (!m) return NextResponse.json({ error: 'market not found' }, { status: 400 });
    data.market = { connect: { id: m.id } };
  }

  const a = await prisma.leadGenAccount.update({ where: { id: accountId }, data: data as any });
  return NextResponse.json(prismaAccountToDomain(a));
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await context.params;
  try {
    await prisma.leadGenAccount.delete({ where: { id: accountId } });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
