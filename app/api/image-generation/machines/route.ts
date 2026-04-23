import { NextRequest, NextResponse } from 'next/server';

import {
  createImageGenerationMachine,
  getImageGenerationMachines,
} from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    machines: await getImageGenerationMachines(),
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const title = String(form.get('title') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Machine title is required.' }, { status: 400 });
  }

  const files = form.getAll('images').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one machine image is required.' }, { status: 400 });
  }

  try {
    const created = await createImageGenerationMachine({
      title,
      notes,
      images: await Promise.all(
        files.map(async (file, index) => ({
          label: `Reference image ${index + 1}`,
          fileName: 'name' in file && typeof file.name === 'string' ? file.name : `${title}-${index + 1}.png`,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create machine.' },
      { status: 400 }
    );
  }
}
