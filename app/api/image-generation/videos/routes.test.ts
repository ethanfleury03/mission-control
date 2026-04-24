import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';
import { GET as getVideoRunRoute } from './[id]/route';
import { GET as getVideoContentRoute } from './[id]/content/route';
import { GET as getVideoSourceRoute } from './[id]/source-image/route';
import { GET as listVideosRoute, POST as createVideoRoute } from './route';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createPendingVideoRun(id: string, jobId: string) {
  return prisma.imageGenerationVideoRun.create({
    data: {
      id,
      userPrompt: 'Animate this hero image.',
      assistantReply: 'Queued a 6-second video from the selected start frame.',
      sourceKind: 'upload',
      sourceImageFileName: 'source.png',
      sourceImageMimeType: 'image/png',
      sourceImageByteSize: 4,
      sourceImageBytes: Buffer.from([1, 2, 3, 4]),
      videoModel: 'google/veo-3.1-fast',
      openrouterJobId: jobId,
      status: 'pending',
      durationSeconds: 6,
      resolution: '720p',
      aspectRatio: '16:9',
    },
  });
}

describe('video generation routes', () => {
  beforeEach(() => {
    process.env.IMAGE_OPENROUTER_API_KEY = 'test-key';
    process.env.IMAGE_OPENROUTER_VIDEO_MODEL = 'google/veo-3.1-fast';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.imageGenerationVideoRun.deleteMany();
    await prisma.imageGenerationRun.deleteMany();
  });

  it('creates a video run via multipart POST and validates bad input', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'job-route', status: 'pending' }, 202)));

    const form = new FormData();
    form.set('prompt', 'Animate this package shot with a slow zoom.');
    form.set('duration', '6');
    form.set('sourceKind', 'upload');
    form.set('messagesJson', '[]');
    form.set('sourceFile', new File([new Uint8Array([1, 2, 3, 4])], 'source.png', { type: 'image/png' }));

    const response = await createVideoRoute(
      new NextRequest('http://localhost/api/image-generation/videos', {
        method: 'POST',
        body: form,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.status).toBe('pending');

    const badResponse = await createVideoRoute(
      new NextRequest('http://localhost/api/image-generation/videos', {
        method: 'POST',
        body: new FormData(),
      }),
    );
    expect(badResponse.status).toBe(400);
  });

  it('lists video runs without raw bytes in JSON', async () => {
    await prisma.imageGenerationVideoRun.create({
      data: {
        id: 'vid_list',
        userPrompt: 'Animate this image.',
        assistantReply: 'Created a 4-second video from the selected start frame.',
        sourceKind: 'upload',
        sourceImageFileName: 'source.png',
        sourceImageMimeType: 'image/png',
        sourceImageByteSize: 4,
        sourceImageBytes: Buffer.from([1, 2, 3, 4]),
        videoModel: 'google/veo-3.1-fast',
        openrouterJobId: 'job-list',
        status: 'completed',
        durationSeconds: 4,
        resolution: '720p',
        aspectRatio: '16:9',
        videoFileName: 'video.mp4',
        videoMimeType: 'video/mp4',
        videoByteSize: 4,
        videoBytes: Buffer.from([4, 3, 2, 1]),
      },
    });

    const response = await listVideosRoute(new NextRequest('http://localhost/api/image-generation/videos'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.runs[0]).not.toHaveProperty('videoBytes');
    expect(payload.runs[0]).not.toHaveProperty('sourceImageBytes');
  });

  it('refreshes pending runs to completed or failed via the detail route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'job-complete', status: 'completed', generation_id: 'gen-complete' }, 200))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0, 1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'video/mp4' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'job-failed', status: 'failed', error: 'Blocked' }, 200));
    vi.stubGlobal('fetch', fetchMock);

    await createPendingVideoRun('vid_complete', 'job-complete');
    await createPendingVideoRun('vid_failed', 'job-failed');

    const completedResponse = await getVideoRunRoute(
      new NextRequest('http://localhost/api/image-generation/videos/vid_complete'),
      { params: Promise.resolve({ id: 'vid_complete' }) },
    );
    const completedPayload = await completedResponse.json();
    expect(completedPayload.status).toBe('completed');
    expect(completedPayload.video.mimeType).toBe('video/mp4');

    const failedResponse = await getVideoRunRoute(
      new NextRequest('http://localhost/api/image-generation/videos/vid_failed'),
      { params: Promise.resolve({ id: 'vid_failed' }) },
    );
    const failedPayload = await failedResponse.json();
    expect(failedPayload.status).toBe('failed');
    expect(failedPayload.errorMessage).toContain('Blocked');
  });

  it('streams video content and source images with the right mime types and 404s when missing', async () => {
    await prisma.imageGenerationVideoRun.create({
      data: {
        id: 'vid_content',
        userPrompt: 'Animate this image.',
        assistantReply: 'Created a 4-second video from the selected start frame.',
        sourceKind: 'upload',
        sourceImageFileName: 'source.png',
        sourceImageMimeType: 'image/png',
        sourceImageByteSize: 4,
        sourceImageBytes: Buffer.from([1, 2, 3, 4]),
        videoModel: 'google/veo-3.1-fast',
        openrouterJobId: 'job-content',
        status: 'completed',
        durationSeconds: 4,
        resolution: '720p',
        aspectRatio: '16:9',
        videoFileName: 'video.mp4',
        videoMimeType: 'video/mp4',
        videoByteSize: 4,
        videoBytes: Buffer.from([4, 3, 2, 1]),
      },
    });

    const videoResponse = await getVideoContentRoute(
      new NextRequest('http://localhost/api/image-generation/videos/vid_content/content'),
      { params: Promise.resolve({ id: 'vid_content' }) },
    );
    expect(videoResponse.status).toBe(200);
    expect(videoResponse.headers.get('Content-Type')).toBe('video/mp4');

    const sourceResponse = await getVideoSourceRoute(
      new NextRequest('http://localhost/api/image-generation/videos/vid_content/source-image'),
      { params: Promise.resolve({ id: 'vid_content' }) },
    );
    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.headers.get('Content-Type')).toBe('image/png');

    const missingVideoResponse = await getVideoContentRoute(
      new NextRequest('http://localhost/api/image-generation/videos/missing/content'),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(missingVideoResponse.status).toBe(404);
  });
});
