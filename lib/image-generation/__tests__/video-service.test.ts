import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
  createVideoGenerationRun,
  getVideoGenerationRunById,
  getVideoGenerationRuns,
} from '../video-service';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('video service', () => {
  beforeEach(() => {
    process.env.IMAGE_OPENROUTER_API_KEY = 'test-key';
    process.env.IMAGE_OPENROUTER_VIDEO_MODEL = 'google/veo-3.1-fast';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.imageGenerationVideoRun.deleteMany();
    await prisma.imageGenerationRun.deleteMany();
  });

  it('accepts an uploaded source image and submits a first-frame OpenRouter request', async () => {
    const fetchMock = vi.fn(async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe('google/veo-3.1-fast');
      expect(payload.duration).toBe(6);
      expect(payload.frame_images[0].frame_type).toBe('first_frame');
      expect(payload.frame_images[0].image_url.url).toContain('data:image/png;base64,');
      return jsonResponse({ id: 'job-upload', status: 'pending' }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);

    const run = await createVideoGenerationRun({
      prompt: 'Animate this product shot with a slow hero push-in.',
      durationSeconds: 6,
      sourceKind: 'upload',
      upload: {
        fileName: 'source.png',
        mimeType: 'image/png',
        byteSize: 4,
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      messages: [],
    });

    expect(run.status).toBe('pending');
    expect(run.sourceKind).toBe('upload');
    expect(run.sourceImageFileName).toBe('source.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a previously generated image source and snapshots its bytes', async () => {
    const savedRun = await prisma.imageGenerationRun.create({
      data: {
        userPrompt: 'Create a catalog hero image',
        assistantReply: 'done',
        imageType: 'blog_image',
        imageDataUrl: 'data:image/png;base64,AQIDBA==',
        imageMimeType: 'image/png',
        imageAlt: 'Saved image',
      },
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'job-generated', status: 'pending' }, 202)));

    const run = await createVideoGenerationRun({
      prompt: 'Animate the camera and add subtle lighting movement.',
      durationSeconds: 4,
      sourceKind: 'generated',
      sourceImageRunId: savedRun.id,
      messages: [],
    });

    const persisted = await prisma.imageGenerationVideoRun.findUnique({ where: { id: run.id } });
    expect(run.sourceKind).toBe('generated');
    expect(run.sourceImageRunId).toBe(savedRun.id);
    expect(persisted?.sourceImageByteSize).toBe(4);
    expect(new Uint8Array(persisted?.sourceImageBytes ?? []).length).toBe(4);
  });

  it('rejects missing source, invalid duration, unsupported mime type, and oversized upload', async () => {
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      createVideoGenerationRun({
        prompt: 'Animate this.',
        durationSeconds: 5 as unknown as 4,
        sourceKind: 'upload',
        upload: {
          fileName: 'source.png',
          mimeType: 'image/png',
          byteSize: 4,
          bytes: new Uint8Array([1, 2, 3, 4]),
        },
        messages: [],
      }),
    ).rejects.toThrow('Video duration must be 4, 6, or 8 seconds.');

    await expect(
      createVideoGenerationRun({
        prompt: 'Animate this.',
        durationSeconds: 4,
        sourceKind: 'upload',
        upload: null,
        messages: [],
      }),
    ).rejects.toThrow('Upload an image');

    await expect(
      createVideoGenerationRun({
        prompt: 'Animate this.',
        durationSeconds: 4,
        sourceKind: 'upload',
        upload: {
          fileName: 'source.pdf',
          mimeType: 'application/pdf',
          byteSize: 4,
          bytes: new Uint8Array([1, 2, 3, 4]),
        },
        messages: [],
      }),
    ).rejects.toThrow('Only image uploads');

    await expect(
      createVideoGenerationRun({
        prompt: 'Animate this.',
        durationSeconds: 4,
        sourceKind: 'upload',
        upload: {
          fileName: 'source.png',
          mimeType: 'image/png',
          byteSize: 16 * 1024 * 1024,
          bytes: new Uint8Array(16),
        },
        messages: [],
      }),
    ).rejects.toThrow('Keep uploads under 15 MB');
  });

  it('persists pending, completed, and failed runs without exposing raw bytes in summaries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'job-complete', status: 'pending' }, 202))
      .mockResolvedValueOnce(jsonResponse({ id: 'job-complete', status: 'completed', generation_id: 'gen-1' }, 200))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'job-failed', status: 'pending' }, 202))
      .mockResolvedValueOnce(jsonResponse({ id: 'job-failed', status: 'failed', error: 'Policy blocked' }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const completedRun = await createVideoGenerationRun({
      prompt: 'Animate this labeler with a premium camera move.',
      durationSeconds: 8,
      sourceKind: 'upload',
      upload: {
        fileName: 'labeler.png',
        mimeType: 'image/png',
        byteSize: 4,
        bytes: new Uint8Array([1, 2, 3, 4]),
      },
      messages: [],
    });

    const completedDetail = await getVideoGenerationRunById(completedRun.id, { refreshPending: true });
    expect(completedDetail?.status).toBe('completed');
    expect(completedDetail?.video?.mimeType).toBe('video/mp4');

    const failedRun = await createVideoGenerationRun({
      prompt: 'Animate this image.',
      durationSeconds: 4,
      sourceKind: 'upload',
      upload: {
        fileName: 'source.png',
        mimeType: 'image/png',
        byteSize: 4,
        bytes: new Uint8Array([4, 3, 2, 1]),
      },
      messages: [],
    });

    const failedDetail = await getVideoGenerationRunById(failedRun.id, { refreshPending: true });
    expect(failedDetail?.status).toBe('failed');
    expect(failedDetail?.errorMessage).toContain('Policy blocked');

    const list = await getVideoGenerationRuns(10);
    expect(list).toHaveLength(2);
    expect(list[0]).not.toHaveProperty('videoBytes');
    expect(list[0]).not.toHaveProperty('sourceImageBytes');
  });
});
