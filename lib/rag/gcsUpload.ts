import { randomUUID } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

import { Storage } from '@google-cloud/storage';

const DEFAULT_MAX_GCS_UPLOAD_BYTES = 750 * 1024 * 1024;
const DEFAULT_INGEST_TOKEN_TTL_SECONDS = 6 * 60 * 60;

let storageClient: Storage | null = null;

export interface RagGcsUploadTarget {
  bucket: string;
  objectName: string;
  gcsUri: string;
  uploadUrl: string;
  maxBytes: number;
  ingestToken: string;
  expiresAt: string;
}

export interface RagGcsIngestTokenPayload {
  v: 1;
  bucket: string;
  objectName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  exp: number;
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

  const tokenPayload = buildIngestTokenPayload({
    bucket: bucketName,
    objectName,
    filename: input.filename,
    contentType: input.contentType || 'application/octet-stream',
    sizeBytes: input.sizeBytes,
  });

  return {
    bucket: bucketName,
    objectName,
    gcsUri: `gs://${bucketName}/${objectName}`,
    uploadUrl,
    maxBytes,
    ingestToken: createRagGcsIngestToken(tokenPayload),
    expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
  };
}

export async function downloadRagGcsObject(input: { bucket: string; objectName: string }): Promise<Buffer> {
  const bucketName = input.bucket || getRagUploadBucket();
  if (!bucketName) throw new Error('Large manual upload storage is not configured. Set RAG_UPLOAD_BUCKET and redeploy.');
  const [bytes] = await getStorageClient().bucket(bucketName).file(input.objectName).download();
  return bytes;
}

export function verifyRagGcsIngestToken(token: string): RagGcsIngestTokenPayload {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart || token.split('.').length !== 2) {
    throw new Error('Large upload authorization is missing or malformed. Refresh the page and retry the upload.');
  }

  const expected = hmac(payloadPart);
  if (!safeEqual(signaturePart, expected)) {
    throw new Error('Large upload authorization is invalid. Refresh the page and retry the upload.');
  }

  let payload: RagGcsIngestTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as RagGcsIngestTokenPayload;
  } catch {
    throw new Error('Large upload authorization is malformed. Refresh the page and retry the upload.');
  }

  if (
    payload.v !== 1 ||
    typeof payload.bucket !== 'string' ||
    typeof payload.objectName !== 'string' ||
    typeof payload.filename !== 'string' ||
    typeof payload.contentType !== 'string' ||
    typeof payload.sizeBytes !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('Large upload authorization is malformed. Refresh the page and retry the upload.');
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Large upload authorization expired. Refresh the page and retry the upload.');
  }

  return payload;
}

export function createRagGcsIngestToken(payload: RagGcsIngestTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${hmac(encoded)}`;
}

function getStorageClient(): Storage {
  storageClient ??= new Storage();
  return storageClient;
}

function buildIngestTokenPayload(input: {
  bucket: string;
  objectName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): RagGcsIngestTokenPayload {
  return {
    v: 1,
    bucket: input.bucket,
    objectName: input.objectName,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    exp: Math.floor(Date.now() / 1000) + getIngestTokenTtlSeconds(),
  };
}

function hmac(value: string): string {
  return createHmac('sha256', getIngestTokenSecret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

function getIngestTokenSecret(): string {
  const secret =
    process.env.RAG_UPLOAD_TOKEN_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    (process.env.NODE_ENV !== 'production' ? 'dev-insecure-auth-secret-only-for-local-npm-run-dev' : '');
  if (!secret) {
    throw new Error('Large manual upload signing is not configured. Set RAG_UPLOAD_TOKEN_SECRET or AUTH_SECRET.');
  }
  return secret;
}

function getIngestTokenTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.RAG_UPLOAD_TOKEN_TTL_SECONDS || String(DEFAULT_INGEST_TOKEN_TTL_SECONDS), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INGEST_TOKEN_TTL_SECONDS;
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
