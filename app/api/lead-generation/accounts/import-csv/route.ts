import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeDomain } from '@/lib/lead-generation/adapters';
import { inferColumnMap, parseCsvLine, rowValue, type CsvColumnMap } from '@/lib/lead-generation/csv-import';
import { buildLeadGenIdentity } from '@/lib/lead-generation/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart form' }, { status: 400 });

  const marketId = String(form.get('marketId') ?? '').trim();
  if (!marketId) return NextResponse.json({ error: 'marketId is required' }, { status: 400 });

  const market = await prisma.leadGenMarket.findUnique({ where: { id: marketId } });
  if (!market) return NextResponse.json({ error: 'market not found' }, { status: 404 });

  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must include a header row and at least one data row' }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]!);
  const colMap = inferColumnMap(header);
  if (!colMap) {
    return NextResponse.json(
      { error: 'Could not detect a company name column. Use headers like: name, company, email, phone, website, country' },
      { status: 400 },
    );
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length && created + skipped < MAX_ROWS; i++) {
    const raw = lines[i]!;
    const cells = parseCsvLine(raw);
    const name = rowValue(cells, colMap.name).trim();
    if (!name) {
      skipped++;
      continue;
    }

    const website = rowValue(cells, colMap.website).trim();
    const domainRaw = rowValue(cells, colMap.domain).trim();
    const domain = normalizeDomain(domainRaw || website || null);
    const identity = buildLeadGenIdentity({ name, domain, website });

    const data = {
      market: { connect: { id: marketId } },
      name,
      normalizedName: identity.normalizedName,
      domain,
      normalizedDomain: identity.normalizedDomain,
      website: website || (domain ? `https://${domain}` : ''),
      email: rowValue(cells, colMap.email).trim(),
      phone: rowValue(cells, colMap.phone).trim(),
      country: rowValue(cells, colMap.country).trim() || 'Unknown',
      region: rowValue(cells, colMap.region).trim(),
      industry: rowValue(cells, colMap.industry).trim(),
      sourceType: 'manual_upload',
      sourceName: 'csv_import',
      reviewState: 'new',
      leadPipelineStage: 'discovered',
      lastSeenAt: new Date(),
    };

    try {
      await prisma.leadGenAccount.create({ data: data as any });
      created++;
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    created,
    skipped,
    errors,
    truncated: lines.length - 1 > MAX_ROWS,
  });
}
