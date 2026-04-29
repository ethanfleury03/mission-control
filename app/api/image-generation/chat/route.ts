import { NextRequest, NextResponse } from 'next/server';

import {
  createImageGenerationReply,
  isImageTypeValue,
  LINKEDIN_MACHINE_REFERENCE_REQUIRED_MESSAGE,
} from '@/lib/image-generation/service';
import type {
  ImageConversationMessage,
  ImageStudioAgentContext,
  ImageStudioGenerationMode,
  VideoDurationSeconds,
  VideoSourceKind,
} from '@/lib/image-generation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgentHistorySummary = NonNullable<ImageStudioAgentContext['historySummary']>;

function isGenerationMode(value: unknown): value is ImageStudioGenerationMode {
  return value === 'chat' || value === 'image' || value === 'video';
}

function isVideoSourceKind(value: unknown): value is VideoSourceKind {
  return value === 'upload' || value === 'generated';
}

function isVideoDuration(value: unknown): value is VideoDurationSeconds {
  return value === 4 || value === 6 || value === 8;
}

function readLimitedString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
}

function parseStudioContext(value: unknown, fallback: {
  generationMode: ImageStudioGenerationMode;
  imageType: ImageStudioAgentContext['imageType'];
  machineId: string | null;
}): ImageStudioAgentContext {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const rawVideoSetup =
    record.videoSetup && typeof record.videoSetup === 'object'
      ? (record.videoSetup as Record<string, unknown>)
      : {};
  const rawKbSummary =
    record.kbSummary && typeof record.kbSummary === 'object'
      ? (record.kbSummary as Record<string, unknown>)
      : null;
  const rawSettingsSummary =
    record.settingsSummary && typeof record.settingsSummary === 'object'
      ? (record.settingsSummary as Record<string, unknown>)
      : null;
  const rawHistorySummary =
    record.historySummary && typeof record.historySummary === 'object'
      ? (record.historySummary as Record<string, unknown>)
      : null;
  const sourceKind = isVideoSourceKind(rawVideoSetup.sourceKind) ? rawVideoSetup.sourceKind : 'upload';
  const selectedDuration = isVideoDuration(rawVideoSetup.selectedDuration) ? rawVideoSetup.selectedDuration : null;
  const kbSummary = rawKbSummary
    ? {
        logoCount: readNonNegativeInteger(rawKbSummary.logoCount) ?? 0,
        postCount: readNonNegativeInteger(rawKbSummary.postCount) ?? 0,
        colorCount: readNonNegativeInteger(rawKbSummary.colorCount) ?? 0,
        colorNames: Array.isArray(rawKbSummary.colorNames)
          ? rawKbSummary.colorNames
              .map((entry) => readLimitedString(entry, 80))
              .filter((entry): entry is string => Boolean(entry))
              .slice(0, 12)
          : [],
      }
    : undefined;
  const settingsSummary = rawSettingsSummary
    ? {
        configured: rawSettingsSummary.configured === true,
        chatModel: readLimitedString(rawSettingsSummary.chatModel, 120) ?? 'unknown',
        imageModel: readLimitedString(rawSettingsSummary.imageModel, 120) ?? 'unknown',
        videoModel: readLimitedString(rawSettingsSummary.videoModel, 120) ?? 'unknown',
      }
    : undefined;
  const historySummary = rawHistorySummary
    ? {
        imageCount: readNonNegativeInteger(rawHistorySummary.imageCount) ?? 0,
        videoCount: readNonNegativeInteger(rawHistorySummary.videoCount) ?? 0,
        recentImages: Array.isArray(rawHistorySummary.recentImages)
          ? rawHistorySummary.recentImages
              .map((entry): AgentHistorySummary['recentImages'][number] | null => {
                const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
                const id = readLimitedString(item?.id, 120);
                const prompt = readLimitedString(item?.prompt, 240);
                if (!id || !prompt || !isImageTypeValue(item?.imageType)) return null;
                return {
                  id,
                  prompt,
                  machineTitle: readLimitedString(item.machineTitle, 160),
                  imageType: item.imageType,
                  createdAt: readLimitedString(item.createdAt, 80) ?? '',
                };
              })
              .filter((entry): entry is AgentHistorySummary['recentImages'][number] => Boolean(entry))
              .slice(0, 8)
          : [],
        recentVideos: Array.isArray(rawHistorySummary.recentVideos)
          ? rawHistorySummary.recentVideos
              .map((entry): AgentHistorySummary['recentVideos'][number] | null => {
                const item = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
                const id = readLimitedString(item?.id, 120);
                const prompt = readLimitedString(item?.prompt, 240);
                if (!id || !prompt || !isVideoDuration(item?.durationSeconds) || !isVideoSourceKind(item?.sourceKind)) {
                  return null;
                }
                const status =
                  item.status === 'pending' ||
                  item.status === 'in_progress' ||
                  item.status === 'completed' ||
                  item.status === 'failed'
                    ? item.status
                    : 'pending';
                return {
                  id,
                  prompt,
                  status,
                  durationSeconds: item.durationSeconds,
                  sourceKind: item.sourceKind,
                  createdAt: readLimitedString(item.createdAt, 80) ?? '',
                };
              })
              .filter((entry): entry is AgentHistorySummary['recentVideos'][number] => Boolean(entry))
              .slice(0, 8)
          : [],
      }
    : undefined;

  return {
    generationMode: isGenerationMode(record.generationMode) ? record.generationMode : fallback.generationMode,
    imageType: isImageTypeValue(record.imageType) ? record.imageType : fallback.imageType,
    activePage:
      record.activePage === 'home' ||
      record.activePage === 'generate' ||
      record.activePage === 'gallery' ||
      record.activePage === 'settings'
        ? record.activePage
        : undefined,
    galleryTab:
      record.galleryTab === 'machines' || record.galleryTab === 'images' || record.galleryTab === 'videos'
        ? record.galleryTab
        : undefined,
    settingsTab:
      record.settingsTab === 'prompts' || record.settingsTab === 'machines' || record.settingsTab === 'kb'
        ? record.settingsTab
        : undefined,
    kbSection:
      record.kbSection === 'logos' || record.kbSection === 'posts' || record.kbSection === 'colors'
        ? record.kbSection
        : undefined,
    selectedMachineId: readLimitedString(record.selectedMachineId, 120) ?? fallback.machineId,
    selectedMachineTitle: readLimitedString(record.selectedMachineTitle, 160),
    selectedMachineNotes: readLimitedString(record.selectedMachineNotes, 800),
    selectedMachineImageCount: readNonNegativeInteger(record.selectedMachineImageCount),
    machineCount: readNonNegativeInteger(record.machineCount),
    kbSummary,
    settingsSummary,
    historySummary,
    videoSetup: {
      sourceKind,
      hasUploadSource: rawVideoSetup.hasUploadSource === true,
      selectedSourceImageRunId: readLimitedString(rawVideoSetup.selectedSourceImageRunId, 120),
      hasGeneratedSource: rawVideoSetup.hasGeneratedSource === true,
      selectedDuration,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const machineId =
      typeof body?.machineId === 'string' && body.machineId.trim().length > 0 ? body.machineId.trim() : null;
    const imageType = body?.imageType;
    const imageMode = body?.imageMode === true;
    const generationMode = isGenerationMode(body?.generationMode) ? body.generationMode : imageMode ? 'image' : 'chat';
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

    const studioContext = parseStudioContext(body?.studioContext, {
      generationMode,
      imageType,
      machineId,
    });

    return NextResponse.json(
      await createImageGenerationReply({
        prompt,
        machineId,
        imageType,
        imageMode,
        generationMode,
        studioContext,
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
