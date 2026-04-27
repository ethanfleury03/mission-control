import { prisma } from '@/lib/prisma';

import { DEFAULT_IMAGE_STUDIO_VIDEO_MODEL } from './defaults';
import { ensureImageGenerationSchema } from './service';
import type {
  ImageConversationMessage,
  VideoDurationSeconds,
  VideoGenerationRunSummary,
  VideoGenerationStatus,
  VideoSourceKind,
} from './types';

const OPENROUTER_VIDEOS_API_URL = 'https://openrouter.ai/api/v1/videos';
const VIDEO_REQUEST_TIMEOUT_MS = 120_000;
const VIDEO_POLL_TIMEOUT_MS = 45_000;
const VIDEO_LIST_LIMIT = 12;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const DEFAULT_VIDEO_RESOLUTION = '720p';
const DEFAULT_VIDEO_ASPECT_RATIO = '16:9';
const SUPPORTED_VIDEO_DURATIONS = new Set<VideoDurationSeconds>([4, 6, 8]);

type SourceSnapshot = {
  sourceKind: VideoSourceKind;
  sourceImageRunId?: string | null;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
  dataUrl: string;
};

type OpenRouterVideoSubmitPayload = {
  id?: string;
  polling_url?: string;
  status?: string;
  generation_id?: string;
  error?: { message?: string };
};

type OpenRouterVideoStatusPayload = {
  id?: string;
  generation_id?: string | null;
  status?: string;
  error?: string | null;
  unsigned_urls?: string[];
};

type VideoRunRow = {
  id: string;
  userPrompt: string;
  assistantReply: string;
  sourceKind: string;
  sourceImageRunId: string | null;
  sourceImageFileName: string;
  sourceImageMimeType: string;
  sourceImageByteSize: number;
  videoModel: string;
  openrouterJobId: string;
  openrouterGenerationId: string | null;
  status: string;
  errorMessage: string | null;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
  videoFileName: string | null;
  videoMimeType: string | null;
  videoByteSize: number | null;
  videoBytes?: Uint8Array | Buffer | null;
  createdAt: Date;
  updatedAt: Date;
};

function getOpenRouterApiKey(): string | null {
  return process.env.IMAGE_OPENROUTER_API_KEY?.trim() || null;
}

function getConfiguredVideoModel(): string {
  return process.env.IMAGE_OPENROUTER_VIDEO_MODEL?.trim() || DEFAULT_IMAGE_STUDIO_VIDEO_MODEL;
}

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function isVideoDurationSeconds(value: unknown): value is VideoDurationSeconds {
  return typeof value === 'number' && SUPPORTED_VIDEO_DURATIONS.has(value as VideoDurationSeconds);
}

function assertImageMimeType(mimeType: string): string {
  if (!mimeType.startsWith('image/')) {
    throw new Error('Only image uploads are supported for video generation.');
  }
  return mimeType;
}

function toImageDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Saved image source is not a supported image data URL.');
  }
  return {
    mimeType: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
  };
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  return normalized.split('/')[1] || 'png';
}

function normalizeVideoStatus(value: string | null | undefined): VideoGenerationStatus {
  if (value === 'completed' || value === 'failed' || value === 'in_progress') return value;
  return 'pending';
}

function isTerminalStatus(status: VideoGenerationStatus): boolean {
  return status === 'completed' || status === 'failed';
}

function buildQueuedReply(durationSeconds: VideoDurationSeconds): string {
  return `Queued a ${durationSeconds}-second video from the selected start frame.`;
}

function buildCompletedReply(durationSeconds: VideoDurationSeconds): string {
  return `Created a ${durationSeconds}-second video from the selected start frame.`;
}

function buildFailedReply(durationSeconds: VideoDurationSeconds, errorMessage: string): string {
  return `The ${durationSeconds}-second video failed: ${errorMessage}`;
}

function mapVideoRun(row: VideoRunRow): VideoGenerationRunSummary {
  const durationSeconds = isVideoDurationSeconds(row.durationSeconds) ? row.durationSeconds : 4;
  const status = normalizeVideoStatus(row.status);
  return {
    id: row.id,
    userPrompt: row.userPrompt,
    assistantReply: row.assistantReply,
    sourceKind: row.sourceKind === 'generated' ? 'generated' : 'upload',
    sourceImageRunId: row.sourceImageRunId,
    sourceImageFileName: row.sourceImageFileName,
    sourceImageMimeType: row.sourceImageMimeType,
    sourceImageByteSize: row.sourceImageByteSize,
    videoModel: row.videoModel,
    openrouterJobId: row.openrouterJobId,
    openrouterGenerationId: row.openrouterGenerationId,
    status,
    errorMessage: row.errorMessage,
    durationSeconds,
    resolution: row.resolution,
    aspectRatio: row.aspectRatio,
    video:
      status === 'completed' && row.videoFileName && row.videoMimeType && row.videoByteSize
        ? {
            fileName: row.videoFileName,
            mimeType: row.videoMimeType,
            byteSize: row.videoByteSize,
            durationSeconds,
            resolution: row.resolution,
            aspectRatio: row.aspectRatio,
          }
        : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveSourceSnapshot(input: {
  sourceKind: VideoSourceKind;
  upload?: {
    fileName: string;
    mimeType: string;
    byteSize: number;
    bytes: Uint8Array;
  } | null;
  sourceImageRunId?: string | null;
}): Promise<SourceSnapshot> {
  if (input.sourceKind === 'upload') {
    if (!input.upload) {
      throw new Error('Upload an image to generate a video.');
    }
    assertImageMimeType(input.upload.mimeType);
    if (input.upload.byteSize <= 0) throw new Error('Uploaded source image is empty.');
    if (input.upload.byteSize > MAX_IMAGE_BYTES) {
      throw new Error('Source image is too large. Keep uploads under 15 MB.');
    }
    return {
      sourceKind: 'upload',
      fileName: input.upload.fileName,
      mimeType: input.upload.mimeType,
      byteSize: input.upload.byteSize,
      bytes: input.upload.bytes,
      dataUrl: toImageDataUrl(input.upload.bytes, input.upload.mimeType),
    };
  }

  const runId = input.sourceImageRunId?.trim();
  if (!runId) {
    throw new Error('Select a generated image to use as the video start frame.');
  }

  const row = await prisma.imageGenerationRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      imageDataUrl: true,
      imageMimeType: true,
    },
  });
  if (!row?.imageDataUrl) {
    throw new Error('Selected generated image was not found.');
  }

  const parsed = parseImageDataUrl(row.imageDataUrl);
  assertImageMimeType(parsed.mimeType);

  return {
    sourceKind: 'generated',
    sourceImageRunId: row.id,
    fileName: `generated-image-${row.id}.${extensionFromMimeType(row.imageMimeType || parsed.mimeType)}`,
    mimeType: row.imageMimeType || parsed.mimeType,
    byteSize: parsed.bytes.byteLength,
    bytes: parsed.bytes,
    dataUrl: row.imageDataUrl,
  };
}

async function createOpenRouterVideoJob(input: {
  prompt: string;
  durationSeconds: VideoDurationSeconds;
  sourceDataUrl: string;
}): Promise<{ jobId: string; generationId: string | null; status: VideoGenerationStatus }> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set IMAGE_OPENROUTER_API_KEY to enable video generation.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIDEO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_VIDEOS_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://arrsys.com',
        'X-Title': 'Arrow Hub Image Studio',
      },
      body: JSON.stringify({
        model: getConfiguredVideoModel(),
        prompt: input.prompt,
        duration: input.durationSeconds,
        resolution: DEFAULT_VIDEO_RESOLUTION,
        aspect_ratio: DEFAULT_VIDEO_ASPECT_RATIO,
        generate_audio: true,
        frame_images: [
          {
            type: 'image_url',
            image_url: { url: input.sourceDataUrl },
            frame_type: 'first_frame',
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as OpenRouterVideoSubmitPayload;
    if (!response.ok) {
      throw new Error(`OpenRouter ${response.status}: ${payload.error?.message || 'Video generation failed'}`);
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    if (typeof payload.id !== 'string' || !payload.id.trim()) {
      throw new Error('OpenRouter did not return a video job ID.');
    }

    return {
      jobId: payload.id,
      generationId: typeof payload.generation_id === 'string' ? payload.generation_id : null,
      status: normalizeVideoStatus(payload.status),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter video request failed';
    if (message.toLowerCase().includes('abort')) {
      throw new Error('OpenRouter video generation timed out while creating the job.');
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollOpenRouterVideoJob(jobId: string): Promise<OpenRouterVideoStatusPayload> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set IMAGE_OPENROUTER_API_KEY to enable video generation.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIDEO_POLL_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_VIDEOS_API_URL}/${encodeURIComponent(jobId)}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const rawPayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = rawPayload as OpenRouterVideoStatusPayload;
    const errorValue = rawPayload.error;
    const errorDetail =
      typeof errorValue === 'string'
        ? errorValue
        : errorValue && typeof errorValue === 'object' && 'message' in errorValue && typeof errorValue.message === 'string'
          ? errorValue.message
          : null;
    if (!response.ok) {
      const detail = errorDetail || 'Video polling failed';
      throw new Error(`OpenRouter ${response.status}: ${detail}`);
    }

    return {
      id: payload.id,
      generation_id: payload.generation_id,
      status: payload.status,
      error: errorDetail,
      unsigned_urls: Array.isArray(payload.unsigned_urls) ? payload.unsigned_urls : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter video polling failed';
    if (message.toLowerCase().includes('abort')) {
      throw new Error('OpenRouter video polling timed out while checking job status.');
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadOpenRouterVideo(jobId: string): Promise<{
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
}> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OpenRouter is not configured. Set IMAGE_OPENROUTER_API_KEY to enable video generation.');
  }

  const response = await fetch(`${OPENROUTER_VIDEOS_API_URL}/${encodeURIComponent(jobId)}/content?index=0`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: Could not download generated video content.`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'video/mp4';
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error('OpenRouter returned an empty video file.');
  }

  return {
    fileName: `video-${jobId}.mp4`,
    mimeType,
    byteSize: bytes.byteLength,
    bytes,
  };
}

async function syncVideoRun(row: VideoRunRow): Promise<VideoRunRow> {
  const currentStatus = normalizeVideoStatus(row.status);
  if (isTerminalStatus(currentStatus)) {
    return row;
  }

  const statusPayload = await pollOpenRouterVideoJob(row.openrouterJobId);
  const nextStatus = normalizeVideoStatus(statusPayload.status);

  if (nextStatus === 'completed') {
    const video = await downloadOpenRouterVideo(row.openrouterJobId);
    return prisma.imageGenerationVideoRun.update({
      where: { id: row.id },
      data: {
        status: 'completed',
        openrouterGenerationId: statusPayload.generation_id ?? row.openrouterGenerationId,
        errorMessage: null,
        assistantReply: buildCompletedReply(isVideoDurationSeconds(row.durationSeconds) ? row.durationSeconds : 4),
        videoFileName: video.fileName,
        videoMimeType: video.mimeType,
        videoByteSize: video.byteSize,
        videoBytes: Buffer.from(video.bytes),
      },
    }) as Promise<VideoRunRow>;
  }

  if (nextStatus === 'failed') {
    const errorMessage = statusPayload.error?.trim() || 'Video generation failed.';
    return prisma.imageGenerationVideoRun.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        openrouterGenerationId: statusPayload.generation_id ?? row.openrouterGenerationId,
        errorMessage,
        assistantReply: buildFailedReply(isVideoDurationSeconds(row.durationSeconds) ? row.durationSeconds : 4, errorMessage),
      },
    }) as Promise<VideoRunRow>;
  }

  return prisma.imageGenerationVideoRun.update({
    where: { id: row.id },
    data: {
      status: nextStatus,
      openrouterGenerationId: statusPayload.generation_id ?? row.openrouterGenerationId,
    },
  }) as Promise<VideoRunRow>;
}

async function maybeRefreshVideoRuns(rows: VideoRunRow[]): Promise<VideoRunRow[]> {
  const refreshed: VideoRunRow[] = [];
  for (const row of rows) {
    if (isTerminalStatus(normalizeVideoStatus(row.status))) {
      refreshed.push(row);
      continue;
    }
    refreshed.push(await syncVideoRun(row));
  }
  return refreshed;
}

export async function createVideoGenerationRun(input: {
  prompt: string;
  durationSeconds: VideoDurationSeconds;
  sourceKind: VideoSourceKind;
  upload?: {
    fileName: string;
    mimeType: string;
    byteSize: number;
    bytes: Uint8Array;
  } | null;
  sourceImageRunId?: string | null;
  messages?: ImageConversationMessage[];
}): Promise<VideoGenerationRunSummary> {
  await ensureImageGenerationSchema();

  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('Prompt is required.');
  if (!isVideoDurationSeconds(input.durationSeconds)) {
    throw new Error('Video duration must be 4, 6, or 8 seconds.');
  }

  const source = await resolveSourceSnapshot({
    sourceKind: input.sourceKind,
    upload: input.upload ?? null,
    sourceImageRunId: input.sourceImageRunId ?? null,
  });

  const submit = await createOpenRouterVideoJob({
    prompt,
    durationSeconds: input.durationSeconds,
    sourceDataUrl: source.dataUrl,
  });

  const created = await prisma.imageGenerationVideoRun.create({
    data: {
      id: generateId('vidrun'),
      userPrompt: prompt,
      assistantReply: buildQueuedReply(input.durationSeconds),
      sourceKind: source.sourceKind,
      sourceImageRunId: source.sourceImageRunId ?? null,
      sourceImageFileName: source.fileName,
      sourceImageMimeType: source.mimeType,
      sourceImageByteSize: source.byteSize,
      sourceImageBytes: Buffer.from(source.bytes),
      videoModel: getConfiguredVideoModel(),
      openrouterJobId: submit.jobId,
      openrouterGenerationId: submit.generationId,
      status: submit.status,
      durationSeconds: input.durationSeconds,
      resolution: DEFAULT_VIDEO_RESOLUTION,
      aspectRatio: DEFAULT_VIDEO_ASPECT_RATIO,
    },
  });

  return mapVideoRun(created);
}

export async function getVideoGenerationRunById(
  id: string,
  options: { refreshPending?: boolean } = {},
): Promise<VideoGenerationRunSummary | null> {
  await ensureImageGenerationSchema();

  const row = (await prisma.imageGenerationVideoRun.findUnique({
    where: { id },
  })) as VideoRunRow | null;
  if (!row) return null;

  const refreshed =
    options.refreshPending && !isTerminalStatus(normalizeVideoStatus(row.status)) ? await syncVideoRun(row) : row;
  return mapVideoRun(refreshed);
}

export async function getVideoGenerationRuns(
  limit: number = VIDEO_LIST_LIMIT,
  options: { refreshPending?: boolean } = {},
): Promise<VideoGenerationRunSummary[]> {
  await ensureImageGenerationSchema();

  const rows = (await prisma.imageGenerationVideoRun.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: Math.max(1, Math.min(limit, 50)),
  })) as VideoRunRow[];

  const refreshed = options.refreshPending ? await maybeRefreshVideoRuns(rows) : rows;
  return refreshed.map(mapVideoRun);
}

export async function getVideoGenerationRunContent(runId: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
} | null> {
  await ensureImageGenerationSchema();

  const row = await prisma.imageGenerationVideoRun.findUnique({
    where: { id: runId },
    select: {
      videoFileName: true,
      videoMimeType: true,
      videoBytes: true,
    },
  });
  if (!row?.videoBytes || !row.videoFileName || !row.videoMimeType) return null;

  return {
    fileName: row.videoFileName,
    mimeType: row.videoMimeType,
    bytes: new Uint8Array(row.videoBytes),
  };
}

export async function getVideoGenerationRunSourceImage(runId: string): Promise<{
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
} | null> {
  await ensureImageGenerationSchema();

  const row = await prisma.imageGenerationVideoRun.findUnique({
    where: { id: runId },
    select: {
      sourceImageFileName: true,
      sourceImageMimeType: true,
      sourceImageBytes: true,
    },
  });
  if (!row) return null;

  return {
    fileName: row.sourceImageFileName,
    mimeType: row.sourceImageMimeType,
    bytes: new Uint8Array(row.sourceImageBytes),
  };
}
