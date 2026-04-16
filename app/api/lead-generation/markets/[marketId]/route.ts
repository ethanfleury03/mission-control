import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { prismaMarketToDomain } from '@/lib/lead-generation/db-mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await context.params;
  const m = await prisma.leadGenMarket.findUnique({ where: { id: marketId } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const count = await prisma.leadGenAccount.count({ where: { marketId: m.id } });
  return NextResponse.json(prismaMarketToDomain(m, count));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await context.params;
  const existing = await prisma.leadGenMarket.findUnique({ where: { id: marketId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const data: Prisma.LeadGenMarketUpdateInput = {};

  if (typeof payload.name === 'string') data.name = payload.name.trim();
  if (typeof payload.description === 'string') data.description = payload.description;
  if (typeof payload.notes === 'string') data.notes = payload.notes;
  if (typeof payload.status === 'string') data.status = payload.status;
  if (typeof payload.slug === 'string') {
    const slug = payload.slug.trim().toLowerCase();
    if (slug && slug !== existing.slug) {
      const clash = await prisma.leadGenMarket.findFirst({ where: { slug, NOT: { id: marketId } } });
      if (clash) return NextResponse.json({ error: 'slug already in use' }, { status: 409 });
      data.slug = slug;
    }
  }
  if (Array.isArray(payload.countries)) data.countriesJson = JSON.stringify(payload.countries.map(String));
  if (Array.isArray(payload.targetPersonas)) data.personasJson = JSON.stringify(payload.targetPersonas.map(String));
  if (Array.isArray(payload.solutionAreas)) data.solutionAreasJson = JSON.stringify(payload.solutionAreas.map(String));

  const m = await prisma.leadGenMarket.update({ where: { id: marketId }, data });
  const count = await prisma.leadGenAccount.count({ where: { marketId: m.id } });
  return NextResponse.json(prismaMarketToDomain(m, count));
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await context.params;
  try {
    await prisma.leadGenMarket.delete({ where: { id: marketId } });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
