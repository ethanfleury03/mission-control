import { NextRequest, NextResponse } from 'next/server';

import {
  createImageGenerationReply,
  isImageTypeValue,
  LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE,
} from '@/lib/image-generation/service';
import type { ImageConversationMessage } from '@/lib/image-generation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const machineId =
      typeof body?.machineId === 'string' && body.machineId.trim().length > 0 ? body.machineId.trim() : null;
    const imageType = body?.imageType;
    const imageMode = body?.imageMode === true;
    const messages: ImageConversationMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .map((entry: unknown): ImageConversationMessage | null => {
            const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
            if (!record) return null;
            const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
            const text = typeof record.text === 'string' ? record.text.trim() : '';
            if (!role || !text) return null;
            return { role, text };
          })
          .filter((entry: ImageConversationMessage | null): entry is ImageConversationMessage => Boolean(entry))
      : [];

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    if (!isImageTypeValue(imageType)) {
      return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });
    }

    return NextResponse.json(
      await createImageGenerationReply({
        prompt,
        machineId,
        imageType,
        imageMode,
        messages,
      })
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create image-generation response.';
    const status =
      message === LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE || message === 'Selected machine was not found.'
        ? 400
        : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
