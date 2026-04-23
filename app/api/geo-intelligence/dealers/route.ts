import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { prismaGeoDealerToDomain } from '@/lib/geo-intelligence/db-mappers';
import { buildCountryIdentity } from '@/lib/geo-intelligence/normalize';
import type { GeoDealerStatus } from '@/lib/geo-intelligence/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validateStatus(status?: string): GeoDealerStatus {
  if (status === 'inactive' || status === 'archived') return status;
  return 'active';
}

function parseLatLng(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function parseBody(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function mapDealerData(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const addressLine1 = typeof body.addressLine1 === 'string' ? body.addressLine1.trim() : '';
  const countryInput = typeof body.country === 'string' ? body.country.trim() : '';
  const lat = parseLatLng(body.lat);
  const lng = parseLatLng(body.lng);

  if (!name) return { error: 'name is required' };
  if (!addressLine1) return { error: 'addressLine1 is required' };
  if (!countryInput) return { error: 'country is required' };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'lat and lng are required' };

  const country = buildCountryIdentity(countryInput);

  return {
    data: {
      name,
      addressLine1,
      addressLine2: typeof body.addressLine2 === 'string' ? body.addressLine2.trim() : '',
      city: typeof body.city === 'string' ? body.city.trim() : '',
      stateRegion: typeof body.stateRegion === 'string' ? body.stateRegion.trim() : '',
      postalCode: typeof body.postalCode === 'string' ? body.postalCode.trim() : '',
      country: country.country || countryInput,
      countryCode: country.countryCode,
      countryIsoA3: country.countryIsoA3,
      lat,
      lng,
      status: validateStatus(typeof body.status === 'string' ? body.status : undefined),
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    },
  };
}

export async function GET() {
  const dealers = await prisma.geoDealer.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(dealers.map((dealer) => prismaGeoDealerToDomain(dealer)));
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const mapped = mapDealerData(body as Record<string, unknown>);
  if ('error' in mapped) {
    return NextResponse.json({ error: mapped.error }, { status: 400 });
  }

  const dealer = await prisma.geoDealer.create({ data: mapped.data });
  return NextResponse.json(prismaGeoDealerToDomain(dealer), { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await prisma.geoDealer.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Dealer not found' }, { status: 404 });

  const mapped = mapDealerData({
    ...existing,
    ...body,
  });
  if ('error' in mapped) {
    return NextResponse.json({ error: mapped.error }, { status: 400 });
  }

  const dealer = await prisma.geoDealer.update({
    where: { id },
    data: mapped.data,
  });

  return NextResponse.json(prismaGeoDealerToDomain(dealer));
}

export async function DELETE(request: NextRequest) {
  const body = await parseBody(request);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await prisma.geoDealer.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Dealer not found' }, { status: 404 });

  await prisma.geoDealer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
