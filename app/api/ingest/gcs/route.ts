import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { downloadRagGcsObject, getRagUploadBucket, verifyRagGcsIngestToken } from '@/lib/rag/gcsUpload';
import { ingestRemoteUploadedFile, type DuplicateBehavior } from '@/lib/rag/ingestion';
import type { DocumentType, ProductFamily } from '@/lib/rag/types';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Expected JSON body.' }, { status: 400 });

  const filename = normalizeString(body.filename);
  const objectName = normalizeString(body.objectName);
  const bucket = normalizeString(body.bucket) || getRagUploadBucket();
  const ingestToken = normalizeString(body.ingestToken);
  const contentType = normalizeString(body.contentType) || 'application/octet-stream';
  const sizeBytes = Number(body.sizeBytes || 0);
  if (!filename) return NextResponse.json({ error: 'filename is required.' }, { status: 400 });
  if (!objectName) return NextResponse.json({ error: 'objectName is required.' }, { status: 400 });
  if (!bucket) return NextResponse.json({ error: 'Large-file uploads are not configured. Set RAG_UPLOAD_BUCKET.' }, { status: 400 });
  if (!ingestToken) {
    return NextResponse.json({ error: 'Large upload authorization is missing. Refresh the page and retry the upload.' }, { status: 400 });
  }

  try {
    const tokenPayload = verifyRagGcsIngestToken(ingestToken);
    if (
      tokenPayload.bucket !== bucket ||
      tokenPayload.objectName !== objectName ||
      tokenPayload.filename !== filename ||
      tokenPayload.contentType !== contentType ||
      tokenPayload.sizeBytes !== sizeBytes
    ) {
      return NextResponse.json({ error: 'Large upload authorization does not match this upload. Refresh the page and retry.' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Large upload authorization failed. Refresh the page and retry the upload.' },
      { status: 400 },
    );
  }

  const batchId = normalizeString(body.batchId) || randomUUID();
  const duplicateBehavior = normalizeDuplicateBehavior(body.duplicateBehavior);
  const autoDetectMetadata = body.autoDetectMetadata !== false;
  const applyMetadataToAll = body.applyMetadataToAll === true;
  const metadataPreset = normalizeMetadataPreset(body.metadataPreset);
  const gcsUri = `gs://${bucket}/${objectName}`;

  console.info('[rag:ingest:gcs] ingest requested', { filename, bucket, objectName, batchId });

  try {
    const bytes = await downloadRagGcsObject({ bucket, objectName });
    const result = await ingestRemoteUploadedFile({
      filename,
      bytes,
      mimeType: contentType,
      sourcePath: gcsUri,
      options: {
        batchId,
        duplicateBehavior,
        autoDetectMetadata,
        metadataPreset: applyMetadataToAll ? metadataPreset : {},
      },
    });
    console.info('[rag:ingest:gcs] ingest finished', {
      filename,
      jobId: result.jobId,
      documentId: result.documentId,
      status: result.status,
      pageCount: result.pageCount,
      chunkCount: result.chunkCount,
    });
    return NextResponse.json({ batchId, results: [result] }, { status: 201 });
  } catch (error) {
    const message = humanGcsIngestionFailure(error);
    console.error('[rag:ingest:gcs] ingest failed', {
      filename,
      batchId,
      gcsUri,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({
      batchId,
      results: [{
        batchId,
        jobId: '',
        documentId: null,
        filename,
        status: 'failed',
        message,
        pageCount: 0,
        chunkCount: 0,
        warnings: [message],
      }],
    }, { status: 500 });
  }
}

function normalizeMetadataPreset(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    productFamily: normalizeString(source.productFamily) as ProductFamily | undefined,
    documentType: normalizeString(source.documentType) as DocumentType | undefined,
    version: normalizeString(source.version),
    softwareVersion: normalizeString(source.softwareVersion),
    revisionDate: normalizeString(source.revisionDate) || null,
    notes: normalizeString(source.notes),
  };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDuplicateBehavior(value: unknown): DuplicateBehavior {
  if (value === 'replace' || value === 'new_version') return value;
  return 'skip';
}

function humanGcsIngestionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/No such object|not found/i.test(message)) return 'Large manual upload finished, but the uploaded object could not be found in Cloud Storage.';
  if (/permission|forbidden|denied/i.test(message)) return 'The app does not have permission to read the uploaded manual from Cloud Storage.';
  if (/OPENAI_API_KEY|OPENROUTER_API_KEY|embedding/i.test(message)) return 'Embeddings could not be created. Check the selected embedding provider key.';
  if (/postgres|pgvector|DATABASE_URL|database/i.test(message)) return 'The RAG database is not connected. Set DATABASE_URL to PostgreSQL with pgvector and run the RAG migration.';
  if (/pdf/i.test(message)) return 'PDF text extraction failed. Try OCR mode or check if the PDF is corrupted.';
  return message || 'Large manual ingestion failed. Review staging logs for details.';
}

export const POST = withActiveUser(POSTHandler);
