import { NextRequest, NextResponse } from 'next/server';

import {
  deleteImageStudioKBColor,
  updateImageStudioKBColor,
} from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const updated = await updateImageStudioKBColor({
      id: params.id,
      name: typeof body.name === 'string' ? body.name : '',
      hex: typeof body.hex === 'string' ? body.hex : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update KB color.' },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;

  try {
    await deleteImageStudioKBColor(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not delete KB color.' },
      { status: 400 },
    );
  }
}
