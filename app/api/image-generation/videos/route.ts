import { NextRequest, NextResponse } from 'next/server';

import { createVideoGenerationRun, getVideoGenerationRuns, isVideoDurationSeconds } from '@/lib/image-generation/video-service';
import type { ImageConversationMessage, VideoSourceKind } from '@/lib/image-generation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMessagesJson(raw: FormDataEntryValue | null): ImageConversationMessage[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): ImageConversationMessage | null => {
        const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
        if (!record) return null;
        const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
        const text = typeof record.text === 'string' ? record.text.trim() : '';
        if (!role || !text) return null;
        return { role, text };
      })
      .filter((entry): entry is ImageConversationMessage => Boolean(entry));
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const limitValue = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitValue) ? limitValue : undefined;

  return NextResponse.json({
    runs: await getVideoGenerationRuns(limit, { refreshPending: true }),
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  const prompt = String(form.get('prompt') ?? '').trim();
  const durationValue = Number.parseInt(String(form.get('duration') ?? ''), 10);
  const sourceKind = form.get('sourceKind') === 'generated' ? 'generated' : 'upload';
  const sourceFileEntry = form.get('sourceFile');
  const sourceFile = sourceFileEntry instanceof File ? sourceFileEntry : null;
  const sourceImageRunId = String(form.get('sourceImageRunId') ?? '').trim() || null;

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
  }
  if (!isVideoDurationSeconds(durationValue)) {
    return NextResponse.json({ error: 'Video duration must be 4, 6, or 8 seconds.' }, { status: 400 });
  }

  try {
    const run = await createVideoGenerationRun({
      prompt,
      durationSeconds: durationValue,
      sourceKind: sourceKind as VideoSourceKind,
      upload: sourceFile
        ? {
            fileName: sourceFile.name || 'video-source.png',
            mimeType: sourceFile.type || 'application/octet-stream',
            byteSize: sourceFile.size,
            bytes: new Uint8Array(await sourceFile.arrayBuffer()),
          }
        : null,
      sourceImageRunId,
      messages: parseMessagesJson(form.get('messagesJson')),
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create video generation run.' },
      { status: 400 },
    );
  }
}
