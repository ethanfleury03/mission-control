import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildChunks } from './chunking';
import { getRagStorageDir } from './config';
import {
  createIngestionJob,
  deleteDocument,
  findDocumentByHash,
  findDocumentSource,
  insertDocumentGraph,
  updateIngestionJob,
  updateDocumentMetadata,
} from './db';
import { extractDocumentText, isSupportedRagFile } from './extraction';
import { extractDocumentMetadata, extractDocumentMetadataWithModel } from './metadata';
import { assertEmbeddingProviderConfigured, createEmbeddings } from './providers';
import type { DocumentType, IngestionResult, MetadataExtraction, ProductFamily } from './types';

export type DuplicateBehavior = 'skip' | 'replace' | 'new_version';
const DEFAULT_MAX_FILE_BYTES = 250 * 1024 * 1024;

export interface IngestionOptions {
  batchId?: string;
  duplicateBehavior?: DuplicateBehavior;
  autoDetectMetadata?: boolean;
  metadataPreset?: Partial<{
    title: string;
    productFamily: ProductFamily;
    productModel: string;
    documentType: DocumentType;
    version: string;
    softwareVersion: string;
    revisionDate: string | null;
    notes: string;
  }>;
}

export async function ingestLocalFile(filePath: string, options: IngestionOptions = {}): Promise<IngestionResult> {
  const absolutePath = path.resolve(filePath);
  const bytes = await fs.readFile(absolutePath);
  return ingestBuffer({
    filename: path.basename(absolutePath),
    bytes,
    originalPath: absolutePath,
    sourcePath: absolutePath,
    options,
  });
}

export async function ingestUploadedFile(input: {
  filename: string;
  bytes: Buffer;
  mimeType?: string;
  options?: IngestionOptions;
}): Promise<IngestionResult> {
  const sourceHash = hashBytes(input.bytes);
  const uploadDir = path.join(getRagStorageDir(), 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const storedName = `${sourceHash.slice(0, 16)}-${sanitizeFileName(input.filename)}`;
  const sourcePath = path.join(uploadDir, storedName);
  await fs.writeFile(sourcePath, input.bytes);

  return ingestBuffer({
    filename: input.filename,
    bytes: input.bytes,
    mimeType: input.mimeType,
    originalPath: null,
    sourcePath,
    precomputedHash: sourceHash,
    options: input.options,
  });
}

export async function ingestRemoteUploadedFile(input: {
  filename: string;
  bytes: Buffer;
  mimeType?: string;
  sourcePath: string;
  options?: IngestionOptions;
}): Promise<IngestionResult> {
  return ingestBuffer({
    filename: input.filename,
    bytes: input.bytes,
    mimeType: input.mimeType,
    originalPath: null,
    sourcePath: input.sourcePath,
    options: input.options,
  });
}

export async function ingestFolder(input: { folderPath: string; recursive?: boolean }): Promise<IngestionResult[]> {
  const folderPath = path.resolve(input.folderPath);
  const files = await collectSupportedFiles(folderPath, Boolean(input.recursive));
  const results: IngestionResult[] = [];
  for (const file of files) {
    try {
      results.push(await ingestLocalFile(file, { batchId: input.folderPath }));
    } catch (error) {
      results.push({
        jobId: '',
        documentId: null,
        filename: path.basename(file),
        status: 'failed',
        message: error instanceof Error ? error.message : 'Ingestion failed.',
        pageCount: 0,
        chunkCount: 0,
      });
    }
  }
  return results;
}

async function ingestBuffer(input: {
  filename: string;
  bytes: Buffer;
  mimeType?: string;
  originalPath: string | null;
  sourcePath: string | null;
  precomputedHash?: string;
  options?: IngestionOptions;
}): Promise<IngestionResult> {
  if (!isSupportedRagFile(input.filename)) {
    throw new Error('RAG ingestion supports PDF, TXT, Markdown, DOCX, CSV, and TSV files.');
  }
  assertEmbeddingProviderConfigured();
  const maxFileBytes = Number.parseInt(process.env.RAG_MAX_FILE_BYTES || String(DEFAULT_MAX_FILE_BYTES), 10);
  if (input.bytes.length > maxFileBytes) {
    throw new Error(`File is too large for local ingestion (${formatBytes(input.bytes.length)}). Limit is ${formatBytes(maxFileBytes)}.`);
  }

  const sourceHash = input.precomputedHash || hashBytes(input.bytes);
  const existing = await findDocumentByHash(sourceHash);
  const jobId = await createIngestionJob({
    sourcePath: input.sourcePath || input.originalPath || input.filename,
    filename: input.filename,
    batchId: input.options?.batchId,
  });
  logIngestion(jobId, input.filename, 'job_created', { bytes: input.bytes.length });

  if (existing) {
    if (input.options?.duplicateBehavior === 'replace') {
      await deleteDocument(existing.id);
    } else if (input.options?.duplicateBehavior !== 'new_version') {
      await updateIngestionJob(jobId, {
        status: 'skipped_duplicate',
        documentId: existing.id,
        stats: {
          sourceHash,
          duplicateOf: existing.id,
          phase: 'duplicate_skipped',
          progress: 100,
          humanMessage: 'This exact file is already indexed, so it was skipped.',
        },
      });
      return {
        batchId: input.options?.batchId,
        jobId,
        documentId: existing.id,
        filename: input.filename,
        status: 'skipped_duplicate',
        message: 'This file was already indexed; duplicate ingestion skipped.',
        pageCount: existing.pageCount,
        chunkCount: existing.chunkCount ?? 0,
        productFamily: existing.productFamily,
        documentType: existing.documentType,
        version: existing.version,
        warnings: ['Duplicate file skipped.'],
      };
    }
  }

  if (existing && input.options?.duplicateBehavior === 'new_version') {
    await updateIngestionJob(jobId, {
      status: 'failed',
      documentId: existing.id,
      errorMessage: 'Ingest as new version is not available for byte-identical duplicate files yet. Choose replace or skip.',
      stats: {
        sourceHash,
        duplicateOf: existing.id,
        phase: 'duplicate_blocked',
        progress: 100,
        humanMessage: 'This exact file already exists. Choose replace or skip.',
      },
    });
    return {
      batchId: input.options?.batchId,
      jobId,
      documentId: existing.id,
      filename: input.filename,
      status: 'failed',
      message: 'This exact file already exists. Choose replace or skip.',
      pageCount: existing.pageCount,
      chunkCount: existing.chunkCount ?? 0,
      productFamily: existing.productFamily,
      documentType: existing.documentType,
      version: existing.version,
      warnings: ['Duplicate new-version mode needs a revised file or explicit versioning workflow.'],
    };
  }

  try {
    await updateIngestionJob(jobId, {
      status: 'extracting',
      stats: { sourceHash, phase: 'extracting_text', progress: 35 },
    });
    logIngestion(jobId, input.filename, 'extracting_text');
    const extracted = await extractDocumentText({
      filename: input.filename,
      bytes: input.bytes,
      mimeType: input.mimeType,
    });
    await updateIngestionJob(jobId, {
      status: 'detecting_metadata',
      stats: { phase: 'detecting_metadata', progress: 50, pageCount: extracted.pageCount },
    });
    logIngestion(jobId, input.filename, 'detecting_metadata', { pageCount: extracted.pageCount });
    const firstPages = extracted.pages
      .slice(0, 4)
      .map((page) => page.combinedText)
      .join('\n\n');
    const detectedMetadata = await extractDocumentMetadataWithModel(input.filename, firstPages);
    const metadata = mergeMetadata(input.filename, detectedMetadata, input.options);

    await updateIngestionJob(jobId, {
      status: 'chunking',
      stats: { phase: 'chunking', progress: 62, metadata },
    });
    const preparedChunks = buildChunks({
      pages: extracted.pages,
      metadata,
    });
    logIngestion(jobId, input.filename, 'chunking_complete', { chunkCount: preparedChunks.length });

    let embeddingProvider = '';
    let embeddingError = '';
    let embeddings: Array<number[] | null> = preparedChunks.map(() => null);
    if (preparedChunks.length > 0) {
      try {
        await updateIngestionJob(jobId, {
          status: 'embedding',
          stats: { phase: 'embedding', progress: 74, chunkCount: preparedChunks.length },
        });
        logIngestion(jobId, input.filename, 'embedding', { chunkCount: preparedChunks.length });
        const embedded = await createEmbeddings(preparedChunks.map((chunk) => chunk.text));
        embeddingProvider = embedded.model;
        embeddings = embedded.embeddings;
        logIngestion(jobId, input.filename, 'embedding_complete', { embeddingProvider, embeddingCount: embeddings.length });
      } catch (error) {
        embeddingError = error instanceof Error ? error.message : 'Embedding failed.';
        console.warn('[rag] embedding failed; continuing with keyword-only chunks:', embeddingError);
        logIngestion(jobId, input.filename, 'embedding_failed_keyword_only', { embeddingError });
      }
    }

    await updateIngestionJob(jobId, {
      status: 'indexing',
      stats: { phase: 'indexing', progress: 88 },
    });
    logIngestion(jobId, input.filename, 'indexing');

    const warnings = buildIngestionWarnings({
      metadata,
      embeddingError,
      extractedQuality: averageQuality(extracted.pages.map((page) => page.extractionQualityScore)),
      ocrBacklog: (extracted.metadata.ocrBacklog as number[] | undefined) || [],
      extractionWarnings: Array.isArray(extracted.metadata.extractionWarnings)
        ? (extracted.metadata.extractionWarnings as string[])
        : [],
    });
    const finalStatus = statusFromWarnings(warnings, metadata);

    const documentId = await insertDocumentGraph({
      document: {
        filename: input.filename,
        originalPath: input.originalPath,
        sourcePath: input.sourcePath,
        title: metadata.title,
        productFamily: metadata.product_family,
        productModel: metadata.product_model,
        documentType: metadata.document_type,
        version: metadata.version,
        softwareVersion: metadata.software_version,
        revisionDate: metadata.revision_date,
        sourceHash: input.options?.duplicateBehavior === 'new_version' ? `${sourceHash}-${Date.now()}` : sourceHash,
        pageCount: extracted.pageCount,
        status: finalStatus === 'completed' ? 'indexed' : finalStatus,
        metadata: {
          ...extracted.metadata,
          userPreset: input.options?.metadataPreset || {},
          metadataExtraction: metadata,
          detectedMetadata,
          embeddingProvider,
          embeddingError,
          warnings,
          extractionQuality: extracted.metadata.quality,
        },
      },
      pages: extracted.pages,
      chunks: preparedChunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index] ?? null,
        metadata: {
          ...chunk.metadata,
          embeddingProvider,
          embeddingError,
        },
      })),
    });

    await updateIngestionJob(jobId, {
      status: finalStatus,
      documentId,
      stats: {
        sourceHash,
        phase: finalStatus,
        progress: 100,
        pageCount: extracted.pageCount,
        chunkCount: preparedChunks.length,
        metadata,
        embeddingProvider,
        embeddingError,
        warnings,
        humanMessage: humanStatusMessage(finalStatus, warnings),
      },
    });
    logIngestion(jobId, input.filename, 'finished', { status: finalStatus, documentId, warnings: warnings.length });

    return {
      batchId: input.options?.batchId,
      jobId,
      documentId,
      filename: input.filename,
      status: finalStatus,
      message: humanStatusMessage(finalStatus, warnings),
      pageCount: extracted.pageCount,
      chunkCount: preparedChunks.length,
      productFamily: metadata.product_family,
      documentType: metadata.document_type,
      version: metadata.version,
      warnings,
    };
  } catch (error) {
    const humanMessage = humanizeIngestionError(error);
    logIngestion(jobId, input.filename, 'failed', {
      humanMessage,
      technicalError: error instanceof Error ? error.message : String(error),
    });
    await updateIngestionJob(jobId, {
      status: 'failed',
      errorMessage: humanMessage,
      stats: {
        sourceHash,
        phase: 'failed',
        progress: 100,
        technicalError: error instanceof Error ? error.message : String(error),
        humanMessage,
      },
    });
    return {
      batchId: input.options?.batchId,
      jobId,
      documentId: null,
      filename: input.filename,
      status: 'failed',
      message: humanMessage,
      pageCount: 0,
      chunkCount: 0,
      warnings: [humanMessage],
    };
  }
}

function logIngestion(jobId: string, filename: string, phase: string, detail: Record<string, unknown> = {}): void {
  console.info('[rag:ingest]', { jobId, filename, phase, ...detail });
}

export async function reingestDocument(documentId: string): Promise<IngestionResult> {
  const source = await findDocumentSource(documentId);
  if (!source) {
    throw new Error('Document not found.');
  }
  const filePath = source.sourcePath || source.originalPath;
  if (!filePath) {
    throw new Error('This document has no original file path recorded, so it cannot be re-ingested.');
  }
  const bytes = await fs.readFile(filePath);
  await deleteDocument(documentId);
  return ingestBuffer({
    filename: source.filename,
    bytes,
    originalPath: source.originalPath,
    sourcePath: filePath,
    options: { duplicateBehavior: 'replace' },
  });
}

export async function redetectDocumentMetadata(documentId: string): Promise<void> {
  const { getDocumentPages } = await import('./db');
  const pages = await getDocumentPages(documentId);
  if (pages.length === 0) throw new Error('No extracted pages are available for this document.');
  const firstPages = pages
    .slice(0, 4)
    .map((page) => page.combinedText)
    .join('\n\n');
  const source = await findDocumentSource(documentId);
  const detected = await extractDocumentMetadataWithModel(source?.filename || 'document', firstPages);
  await updateDocumentMetadata(documentId, {
    title: detected.title,
    productFamily: detected.product_family,
    productModel: detected.product_model,
    documentType: detected.document_type,
    version: detected.version,
    softwareVersion: detected.software_version,
    revisionDate: detected.revision_date,
    metadata: { metadataExtraction: detected, redetectedAt: new Date().toISOString() },
  });
}

async function collectSupportedFiles(folderPath: string, recursive: boolean): Promise<string[]> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...(await collectSupportedFiles(fullPath, recursive)));
    } else if (entry.isFile() && isSupportedRagFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sanitizeFileName(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'document';
}

function mergeMetadata(filename: string, detected: MetadataExtraction, options?: IngestionOptions): MetadataExtraction {
  const preset = options?.metadataPreset || {};
  const useDetected = options?.autoDetectMetadata !== false;
  const base = useDetected ? detected : extractDocumentMetadata(filename, '');
  const merged = {
    ...base,
    title: preset.title || base.title,
    product_family: preset.productFamily || base.product_family,
    product_model: preset.productModel ?? base.product_model,
    document_type: preset.documentType || base.document_type,
    version: preset.version ?? base.version,
    software_version: preset.softwareVersion ?? preset.version ?? base.software_version,
    revision_date: preset.revisionDate === undefined ? base.revision_date : preset.revisionDate,
    confidence: preset.productFamily || preset.documentType ? Math.max(base.confidence, 0.8) : base.confidence,
    product_family_confidence: preset.productFamily ? 1 : base.product_family_confidence,
    document_type_confidence: preset.documentType ? 1 : base.document_type_confidence,
    version_confidence: preset.version ? 1 : base.version_confidence,
    revision_date_confidence: preset.revisionDate ? 1 : base.revision_date_confidence,
    signals: [
      ...(base.signals || []),
      preset.productFamily || preset.documentType || preset.version || preset.revisionDate
        ? 'User metadata preset applied during ingestion.'
        : '',
    ].filter(Boolean),
  };
  return merged;
}

function averageQuality(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildIngestionWarnings(input: {
  metadata: MetadataExtraction;
  embeddingError: string;
  extractedQuality: number;
  ocrBacklog: number[];
  extractionWarnings: string[];
}): string[] {
  const warnings: string[] = [];
  if (input.metadata.product_family === 'General') warnings.push('Missing product metadata. Please review before relying on this manual.');
  if (input.metadata.document_type === 'unknown') warnings.push('Missing document type. Please review metadata.');
  if ((input.metadata.product_family_confidence ?? 1) < 0.55) warnings.push('Low product metadata confidence. Please review before relying on product-filtered answers.');
  if ((input.metadata.document_type_confidence ?? 1) < 0.55) warnings.push('Low document type confidence. Please review before relying on doc-type filters.');
  if (input.extractedQuality < 0.35) warnings.push('Low text extraction quality. OCR may be needed for scanned or image-heavy pages.');
  if (input.ocrBacklog.length > 0) warnings.push(`${input.ocrBacklog.length} page(s) have little or no extracted text and may need OCR.`);
  warnings.push(...input.extractionWarnings);
  if (input.embeddingError) warnings.push('Embeddings were not created. Retrieval will use keyword search until embeddings are configured.');
  return [...new Set(warnings)];
}

function statusFromWarnings(warnings: string[], metadata: MetadataExtraction): IngestionResult['status'] {
  if (
    metadata.product_family === 'General' ||
    metadata.document_type === 'unknown' ||
    (metadata.product_family_confidence ?? 1) < 0.55 ||
    (metadata.document_type_confidence ?? 1) < 0.55
  ) return 'needs_metadata_review';
  if (warnings.length > 0) return 'completed_with_warnings';
  return 'completed';
}

function humanStatusMessage(status: IngestionResult['status'], warnings: string[]): string {
  if (status === 'needs_metadata_review') {
    return 'Ingested successfully, but product or document type needs review before support uses it.';
  }
  if (status === 'completed_with_warnings') {
    return warnings[0] || 'Ingested successfully with warnings.';
  }
  return 'Manual ingested, extracted, chunked, and indexed successfully.';
}

function humanizeIngestionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid pdf|pdf/i.test(message)) return 'PDF text extraction failed. Try OCR mode or check if the PDF is corrupted.';
  if (/OPENAI_API_KEY|OPENROUTER_API_KEY|embedding/i.test(message)) return 'Embeddings could not be created. Check the selected embedding provider key or enable RAG_LOCAL_EMBEDDINGS=true for local smoke tests.';
  if (/postgres|pgvector|DATABASE_URL/i.test(message)) return 'The RAG database is not connected. Set DATABASE_URL to PostgreSQL with pgvector and run the RAG migration.';
  return message || 'Ingestion failed. Review the job details for more information.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
