import { NextRequest, NextResponse } from 'next/server';

import {
  getDefaultImageStudioPrompts,
  getPromptKeys,
  getImageStudioSettingsResponse,
  updateImageStudioSettings,
} from '@/lib/image-generation/service';
import type { ImageStudioPromptSet } from '@/lib/image-generation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getImageStudioSettingsResponse());
}

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const promptsBody =
    body.prompts && typeof body.prompts === 'object'
      ? (body.prompts as Record<string, unknown>)
      : undefined;

  try {
    const promptKeys = getPromptKeys();
    const promptPatch = promptsBody
      ? promptKeys.reduce((acc, key) => {
          const value = promptsBody[key];
          if (typeof value === 'string') {
            acc[key] = value;
          }
          return acc;
        }, {} as Partial<ImageStudioPromptSet>)
      : undefined;

    const response = await updateImageStudioSettings({
      prompts: promptPatch
        ? promptPatch
        : body.resetToDefaults === true
          ? getDefaultImageStudioPrompts()
          : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not update Image Studio settings' },
      { status: 400 }
    );
  }
}
