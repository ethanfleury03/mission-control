import { describe, expect, it, beforeEach } from 'vitest';

import { createRagGcsIngestToken, verifyRagGcsIngestToken } from '../gcsUpload';

describe('RAG GCS ingest tokens', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret';
    process.env.RAG_UPLOAD_BUCKET = 'test-rag-bucket';
    process.env.RAG_UPLOAD_TOKEN_TTL_SECONDS = '3600';
  });

  it('creates a signed token bound to the upload target', async () => {
    const token = createRagGcsIngestToken({
      v: 1,
      bucket: 'test-rag-bucket',
      objectName: 'rag-uploads/2026/05/05/id-manual.pdf',
      filename: 'manual.pdf',
      contentType: 'application/pdf',
      sizeBytes: 123,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const payload = verifyRagGcsIngestToken(token);
    expect(payload.bucket).toBe('test-rag-bucket');
    expect(payload.objectName).toBe('rag-uploads/2026/05/05/id-manual.pdf');
    expect(payload.filename).toBe('manual.pdf');
    expect(payload.contentType).toBe('application/pdf');
    expect(payload.sizeBytes).toBe(123);
  });

  it('rejects tampered tokens', async () => {
    const token = createRagGcsIngestToken({
      v: 1,
      bucket: 'test-rag-bucket',
      objectName: 'rag-uploads/2026/05/05/id-manual.pdf',
      filename: 'manual.pdf',
      contentType: 'application/pdf',
      sizeBytes: 123,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const [payload, signature] = token.split('.');
    const tampered = `${payload.slice(0, -1)}x.${signature}`;
    expect(() => verifyRagGcsIngestToken(tampered)).toThrow(/invalid|malformed/i);
  });

  it('rejects expired tokens', async () => {
    const token = createRagGcsIngestToken({
      v: 1,
      bucket: 'test-rag-bucket',
      objectName: 'rag-uploads/2026/05/05/id-manual.pdf',
      filename: 'manual.pdf',
      contentType: 'application/pdf',
      sizeBytes: 123,
      exp: Math.floor(Date.now() / 1000) - 1,
    });

    expect(() => verifyRagGcsIngestToken(token)).toThrow(/expired/i);
  });
});
