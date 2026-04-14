import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaMarketToDomain } from '@/lib/lead-generation/db-mappers';
import { seedLeadGenIfEmpty } from '@/lib/lead-generation/seed-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  await seedLeadGenIfEmpty();
  const { slug } = await context.params;
  const m = await prisma.leadGenMarket.findUnique({ where: { slug } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const count = await prisma.leadGenAccount.count({ where: { marketId: m.id } });
  return NextResponse.json(prismaMarketToDomain(m, count));
}
