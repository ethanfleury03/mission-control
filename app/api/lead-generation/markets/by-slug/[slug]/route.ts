import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaMarketToDomain } from '@/lib/lead-generation/db-mappers';
import { withActiveUser } from '../../../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const m = await prisma.leadGenMarket.findUnique({ where: { slug } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const count = await prisma.leadGenAccount.count({ where: { marketId: m.id } });
  return NextResponse.json(prismaMarketToDomain(m, count));
}

export const GET = withActiveUser(GETHandler);
