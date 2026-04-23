import { NextRequest, NextResponse } from 'next/server';

import { addImageGenerationMachineImages } from '@/lib/image-generation/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const files = form.getAll('images').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one machine image is required.' }, { status: 400 });
  }

  try {
    const updated = await addImageGenerationMachineImages({
      machineId: params.id,
      files: await Promise.all(
        files.map(async (file, index) => ({
          label: `Reference image ${index + 1}`,
          fileName: 'name' in file && typeof file.name === 'string' ? file.name : `reference-${index + 1}.png`,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not add machine images.' },
      { status: 400 },
    );
  }
}
