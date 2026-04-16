import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaMarketToDomain } from '@/lib/lead-generation/db-mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'market';
}

/** GET: list markets with company counts. Seeds demo data on first empty DB. */
export async function GET() {
  const markets = await prisma.leadGenMarket.findMany({ orderBy: { name: 'asc' } });
  const counts = await prisma.leadGenAccount.groupBy({
    by: ['marketId'],
    _count: { id: true },
  });
  const countMap = new Map(counts.map((c) => [c.marketId, c._count.id]));

  const body = markets.map((m) => prismaMarketToDomain(m, countMap.get(m.id) ?? 0));
  return NextResponse.json(body);
}

/** POST: create market { name, description?, countries?, targetPersonas?, solutionAreas?, status?, notes?, slug? } */
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let slug = typeof payload.slug === 'string' ? payload.slug.trim().toLowerCase() : slugify(name);
  const exists = await prisma.leadGenMarket.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;

  const countries = Array.isArray(payload.countries) ? payload.countries.map(String) : [];
  const personas = Array.isArray(payload.targetPersonas) ? payload.targetPersonas.map(String) : [];
  const solutions = Array.isArray(payload.solutionAreas) ? payload.solutionAreas.map(String) : [];
  const status = typeof payload.status === 'string' ? payload.status : 'active';
  const description = typeof payload.description === 'string' ? payload.description : '';
  const notes = typeof payload.notes === 'string' ? payload.notes : '';

  const m = await prisma.leadGenMarket.create({
    data: {
      slug,
      name,
      description,
      countriesJson: JSON.stringify(countries),
      personasJson: JSON.stringify(personas),
      solutionAreasJson: JSON.stringify(solutions),
      status,
      notes,
    },
  });

  return NextResponse.json(prismaMarketToDomain(m, 0), { status: 201 });
}
