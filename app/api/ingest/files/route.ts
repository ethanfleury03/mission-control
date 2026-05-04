import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { ingestUploadedFile, type DuplicateBehavior } from '@/lib/rag/ingestion';
import type { DocumentType, ProductFamily } from '@/lib/rag/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });

  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'Select at least one file to ingest.' }, { status: 400 });

  const batchId = normalizeString(form.get('batchId')) || randomUUID();
  const duplicateBehavior = normalizeDuplicateBehavior(form.get('duplicateBehavior'));
  const autoDetectMetadata = String(form.get('autoDetectMetadata') ?? 'true').toLowerCase() !== 'false';
  const applyMetadataToAll = String(form.get('applyMetadataToAll') ?? 'false').toLowerCase() === 'true';
  const metadataPreset = {
    productFamily: normalizeString(form.get('productFamily')) as ProductFamily | undefined,
    documentType: normalizeString(form.get('documentType')) as DocumentType | undefined,
    version: normalizeString(form.get('version')),
    softwareVersion: normalizeString(form.get('softwareVersion')),
    revisionDate: normalizeString(form.get('revisionDate')) || null,
    notes: normalizeString(form.get('notes')),
  };

  const results = [];
  for (const file of files) {
    console.info('[rag:ingest] upload received', {
      filename: file.name,
      size: file.size,
      batchId,
      duplicateBehavior,
      autoDetectMetadata,
    });
    try {
      const result = await ingestUploadedFile({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes: Buffer.from(await file.arrayBuffer()),
        options: {
          batchId,
          duplicateBehavior,
          autoDetectMetadata,
          metadataPreset: applyMetadataToAll ? metadataPreset : {},
        },
      });
      console.info('[rag:ingest] upload finished', {
        filename: file.name,
        jobId: result.jobId,
        documentId: result.documentId,
        status: result.status,
        pageCount: result.pageCount,
        chunkCount: result.chunkCount,
      });
      results.push(result);
    } catch (error) {
      console.error('[rag:ingest] upload failed before result', {
        filename: file.name,
        batchId,
        message: error instanceof Error ? error.message : String(error),
      });
      results.push({
        batchId,
        jobId: '',
        documentId: null,
        filename: file.name,
        status: 'failed',
        message: humanUploadFailure(error),
        pageCount: 0,
        chunkCount: 0,
        warnings: [humanUploadFailure(error)],
      });
    }
  }

  return NextResponse.json({ batchId, results }, { status: 201 });
}

function humanUploadFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/too large/i.test(message)) return message;
  if (/unsupported|supports PDF/i.test(message)) return 'Unsupported file type. Upload PDF, TXT, Markdown, DOCX, CSV, or TSV files.';
  if (/postgres|pgvector|DATABASE_URL|database/i.test(message)) {
    return 'The RAG database is not connected. Set DATABASE_URL to PostgreSQL with pgvector and run the RAG migration.';
  }
  if (/pdf/i.test(message)) return 'PDF text extraction failed. Try OCR mode or check if the PDF is corrupted.';
  return message || 'Upload failed. Review the ingestion job details for more information.';
}

function normalizeString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDuplicateBehavior(value: FormDataEntryValue | null): DuplicateBehavior {
  if (value === 'replace' || value === 'new_version') return value;
  return 'skip';
}
