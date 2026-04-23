import { NextResponse } from 'next/server';
import { commitPhoneCsvImport } from '@/lib/phone/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart form' }, { status: 400 });

  const displayName = String(form.get('displayName') ?? '').trim();
  if (!displayName) return NextResponse.json({ error: 'displayName is required' }, { status: 400 });

  const file = form.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const text = await file.text();
    const list = await commitPhoneCsvImport({
      displayName,
      notes: String(form.get('notes') ?? ''),
      text,
    });
    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not import CSV list' },
      { status: 400 },
    );
  }
}
