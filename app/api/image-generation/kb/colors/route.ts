import { NextRequest, NextResponse } from 'next/server';

import { createImageStudioKBColor } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const created = await createImageStudioKBColor({
      name: typeof body.name === 'string' ? body.name : '',
      hex: typeof body.hex === 'string' ? body.hex : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create KB color.' },
      { status: 400 },
    );
  }
}
