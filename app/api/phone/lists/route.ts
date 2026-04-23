import { NextRequest, NextResponse } from 'next/server';
import { createPhoneList, getPhoneLists } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getPhoneLists());
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const list = await createPhoneList({
      sourceType: (typeof body.sourceType === 'string' ? body.sourceType : 'manual') as 'manual',
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
      sourceMetadata:
        body.sourceMetadata && typeof body.sourceMetadata === 'object'
          ? (body.sourceMetadata as Record<string, unknown>)
          : {},
      entries: Array.isArray(body.entries)
        ? body.entries
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => entry as Record<string, unknown>)
            .map((entry) => ({
              companyName: typeof entry.companyName === 'string' ? entry.companyName : '',
              contactName: typeof entry.contactName === 'string' ? entry.contactName : '',
              title: typeof entry.title === 'string' ? entry.title : '',
              phoneRaw: typeof entry.phoneRaw === 'string' ? entry.phoneRaw : '',
              email: typeof entry.email === 'string' ? entry.email : '',
              website: typeof entry.website === 'string' ? entry.website : '',
              country: typeof entry.country === 'string' ? entry.country : '',
              timezone: typeof entry.timezone === 'string' ? entry.timezone : '',
              notes: typeof entry.notes === 'string' ? entry.notes : '',
              sourceMetadata:
                entry.sourceMetadata && typeof entry.sourceMetadata === 'object'
                  ? (entry.sourceMetadata as Record<string, unknown>)
                  : {},
              sourceExternalId: typeof entry.sourceExternalId === 'string' ? entry.sourceExternalId : null,
            }))
        : [],
    });

    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create phone list' },
      { status: 400 },
    );
  }
}
