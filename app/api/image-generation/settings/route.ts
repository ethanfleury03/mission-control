import { NextRequest, NextResponse } from 'next/server';

import {
  getDefaultImageStudioPrompts,
  getPromptKeys,
  getImageStudioSettingsResponse,
  updateImageStudioSettings,
} from '@/lib/image-generation/service';
import type { ImageStudioPromptSet } from '@/lib/image-generation/types';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  return NextResponse.json(await getImageStudioSettingsResponse());
}

async function PATCHHandler(request: NextRequest) {
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

export const GET = withActiveUser(GETHandler);
export const PATCH = withActiveUser(PATCHHandler);
