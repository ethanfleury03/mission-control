import { NextRequest, NextResponse } from 'next/server';

import { updateImageGenerationMachine } from '@/lib/image-generation/service';

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
    const updated = await updateImageGenerationMachine({
      id: params.id,
      title: typeof body.title === 'string' ? body.title : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update machine.' },
      { status: 400 },
    );
  }
}
