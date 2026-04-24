import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ARROW_ORIGIN } from '@/lib/geo-intelligence/constants';
import { prismaGeoDealerToDomain } from '@/lib/geo-intelligence/db-mappers';
import { resolveCountryRecord } from '@/lib/geo-intelligence/boundaries';
import { buildCountryIdentity } from '@/lib/geo-intelligence/normalize';
import { ensureGeoIntelligenceSchema } from '@/lib/geo-intelligence/schema';
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

function isArrowOrigin(lat: number, lng: number) {
  return Math.abs(lat - ARROW_ORIGIN.lat) < 0.000001 && Math.abs(lng - ARROW_ORIGIN.lng) < 0.000001;
}

function resolveDealerCoordinates({
  lat,
  lng,
  countryInput,
  countryCode,
}: {
  lat: number;
  lng: number;
  countryInput: string;
  countryCode?: string;
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { lat, lng };
  }

  if (!isArrowOrigin(lat, lng)) {
    return { lat, lng };
  }

  const country = resolveCountryRecord(countryInput, countryCode);
  if (!country) {
    return { lat, lng };
  }

  // If the user never moved the default Burlington pin, place the dealer on the
  // entered country's centroid so every dealer appears somewhere meaningful.
  if (country.isoA3 !== 'CAN') {
    return {
      lat: country.labelLat,
      lng: country.labelLng,
    };
  }

  return { lat, lng };
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
  const coords = resolveDealerCoordinates({
    lat,
    lng,
    countryInput,
    countryCode: country.countryCode,
  });

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
      lat: coords.lat,
      lng: coords.lng,
      status: validateStatus(typeof body.status === 'string' ? body.status : undefined),
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    },
  };
}

export async function GET() {
  try {
    await ensureGeoIntelligenceSchema();
    const dealers = await prisma.geoDealer.findMany({
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(dealers.map((dealer) => prismaGeoDealerToDomain(dealer)));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P2021' || code === 'P2022') {
      return NextResponse.json([]);
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  await ensureGeoIntelligenceSchema();
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
  await ensureGeoIntelligenceSchema();
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
  await ensureGeoIntelligenceSchema();
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
