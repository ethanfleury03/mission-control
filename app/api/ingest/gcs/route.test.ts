import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { downloadRagGcsObject, verifyRagGcsIngestToken } from '@/lib/rag/gcsUpload';
import { ingestRemoteUploadedFile } from '@/lib/rag/ingestion';

vi.mock('../../_lib/with-active-user', () => ({
  withActiveUser: (handler: unknown) => handler,
}));

vi.mock('@/lib/rag/gcsUpload', () => ({
  downloadRagGcsObject: vi.fn(),
  getRagUploadBucket: vi.fn(() => 'rag-bucket'),
  verifyRagGcsIngestToken: vi.fn(),
}));

vi.mock('@/lib/rag/ingestion', () => ({
  ingestRemoteUploadedFile: vi.fn(),
}));

const mockedVerifyToken = vi.mocked(verifyRagGcsIngestToken);
const mockedDownload = vi.mocked(downloadRagGcsObject);
const mockedIngest = vi.mocked(ingestRemoteUploadedFile);

const signedPayload = {
  v: 1 as const,
  bucket: 'rag-bucket',
  objectName: 'rag-uploads/2026/05/05/upload.pdf',
  filename: 'upload.pdf',
  contentType: 'application/pdf',
  sizeBytes: 12345,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://mission-control.test/api/ingest/gcs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    batchId: 'batch-1',
    filename: signedPayload.filename,
    contentType: signedPayload.contentType,
    sizeBytes: signedPayload.sizeBytes,
    bucket: signedPayload.bucket,
    objectName: signedPayload.objectName,
    ingestToken: 'signed-token',
    ...overrides,
  };
}

describe('/api/ingest/gcs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedVerifyToken.mockReturnValue(signedPayload);
    mockedDownload.mockResolvedValue(Buffer.from('pdf bytes'));
    mockedIngest.mockResolvedValue({
      batchId: 'batch-1',
      jobId: 'job-1',
      documentId: 'doc-1',
      filename: signedPayload.filename,
      status: 'completed',
      message: 'ok',
      pageCount: 1,
      chunkCount: 1,
      warnings: [],
    });
  });

  it('ingests when the signed token matches the requested GCS object', async () => {
    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(201);
    expect(mockedDownload).toHaveBeenCalledWith({
      bucket: signedPayload.bucket,
      objectName: signedPayload.objectName,
    });
    expect(mockedIngest).toHaveBeenCalledWith(expect.objectContaining({
      filename: signedPayload.filename,
      mimeType: signedPayload.contentType,
      sourcePath: `gs://${signedPayload.bucket}/${signedPayload.objectName}`,
    }));
  });

  it('rejects missing ingest tokens before touching Cloud Storage', async () => {
    const response = await POST(makeRequest(validBody({ ingestToken: undefined })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringMatching(/authorization is missing/i),
    }));
    expect(mockedVerifyToken).not.toHaveBeenCalled();
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it.each([
    ['bucket', { bucket: 'attacker-bucket' }],
    ['object', { objectName: 'other/object.pdf' }],
    ['filename', { filename: 'other.pdf' }],
    ['content type', { contentType: 'text/plain' }],
    ['size', { sizeBytes: 999 }],
  ])('rejects %s mismatches before touching Cloud Storage', async (_label, overrides) => {
    const response = await POST(makeRequest(validBody(overrides)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringMatching(/does not match/i),
    }));
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', 'Large upload authorization expired. Refresh the page and retry the upload.'],
    ['tampered', 'Large upload authorization is invalid. Refresh the page and retry the upload.'],
  ])('rejects %s tokens before touching Cloud Storage', async (_label, errorMessage) => {
    mockedVerifyToken.mockImplementationOnce(() => {
      throw new Error(errorMessage);
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: errorMessage });
    expect(mockedDownload).not.toHaveBeenCalled();
  });
});
