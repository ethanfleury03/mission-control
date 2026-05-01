import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { Storage } from '@google-cloud/storage';

const DEFAULT_MAX_GCS_UPLOAD_BYTES = 750 * 1024 * 1024;

let storageClient: Storage | null = null;

export interface RagGcsUploadTarget {
  bucket: string;
  objectName: string;
  gcsUri: string;
  uploadUrl: string;
  maxBytes: number;
}

export function getRagUploadBucket(): string {
  return process.env.RAG_UPLOAD_BUCKET?.trim() || '';
}

export function getMaxGcsUploadBytes(): number {
  const parsed = Number.parseInt(process.env.RAG_MAX_GCS_UPLOAD_BYTES || String(DEFAULT_MAX_GCS_UPLOAD_BYTES), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_GCS_UPLOAD_BYTES;
}

export function isGcsUploadConfigured(): boolean {
  return Boolean(getRagUploadBucket());
}

export async function createRagResumableUpload(input: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  origin?: string | null;
}): Promise<RagGcsUploadTarget> {
  const bucketName = getRagUploadBucket();
  if (!bucketName) {
    throw new Error('Large manual upload storage is not configured. Set RAG_UPLOAD_BUCKET and redeploy.');
  }

  const maxBytes = getMaxGcsUploadBytes();
  if (input.sizeBytes > maxBytes) {
    throw new Error(`Manual is too large for configured large-file uploads (${formatBytes(input.sizeBytes)}). Limit is ${formatBytes(maxBytes)}.`);
  }

  const objectName = buildObjectName(input.filename);
  const client = getStorageClient();
  const file = client.bucket(bucketName).file(objectName);
  const [uploadUrl] = await file.createResumableUpload({
    origin: input.origin || undefined,
    metadata: {
      contentType: input.contentType || 'application/octet-stream',
      metadata: {
        originalFilename: input.filename,
        createdBy: 'mission-control-rag',
      },
    },
  });

  return {
    bucket: bucketName,
    objectName,
    gcsUri: `gs://${bucketName}/${objectName}`,
    uploadUrl,
    maxBytes,
  };
}

export async function downloadRagGcsObject(input: { bucket: string; objectName: string }): Promise<Buffer> {
  const bucketName = input.bucket || getRagUploadBucket();
  if (!bucketName) throw new Error('Large manual upload storage is not configured. Set RAG_UPLOAD_BUCKET and redeploy.');
  const [bytes] = await getStorageClient().bucket(bucketName).file(input.objectName).download();
  return bytes;
}

function getStorageClient(): Storage {
  storageClient ??= new Storage();
  return storageClient;
}

function buildObjectName(filename: string): string {
  const safeName = sanitizeFileName(path.basename(filename));
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `rag-uploads/${y}/${m}/${d}/${randomUUID()}-${safeName}`;
}

function sanitizeFileName(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'manual';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
