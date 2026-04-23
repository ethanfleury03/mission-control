import { prisma } from '@/lib/prisma';
import type { ManualFile, ManualSummary } from './types';

export const MAX_MANUAL_BYTES = 25 * 1024 * 1024;

const ACCEPTED_MANUAL_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md']);
const ACCEPTED_MANUAL_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
]);

const MANUALS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "manuals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileBytes" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "manuals_createdAt_idx" ON "manuals"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "manuals_updatedAt_idx" ON "manuals"("updatedAt")`,
].map((statement) => statement.replace(/\s+/g, ' ').trim());

let manualsSchemaReady = false;
let manualsSchemaPromise: Promise<void> | null = null;

function generateId(): string {
  return `manual_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

async function ensureManualsSchema(): Promise<void> {
  if (manualsSchemaReady) return;
  if (manualsSchemaPromise) {
    await manualsSchemaPromise;
    return;
  }

  manualsSchemaPromise = (async () => {
    for (const statement of MANUALS_SCHEMA_STATEMENTS) {
      await prisma.$executeRawUnsafe(statement);
    }
    manualsSchemaReady = true;
  })();

  try {
    await manualsSchemaPromise;
  } finally {
    manualsSchemaPromise = null;
  }
}

function mapManual(row: {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  createdAt: Date;
  updatedAt: Date;
}): ManualSummary {
  return {
    id: row.id,
    name: row.name,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getFileExtension(fileName: string): string {
  const match = fileName.trim().toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? '';
}

export function isAcceptedManualFile(fileName: string, mimeType: string): boolean {
  return ACCEPTED_MANUAL_EXTENSIONS.has(getFileExtension(fileName)) || ACCEPTED_MANUAL_MIME_TYPES.has(mimeType);
}

export async function getManuals(): Promise<ManualSummary[]> {
  await ensureManualsSchema();
  const rows = await prisma.manual.findMany({
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map(mapManual);
}

export async function createManual(input: {
  name: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
}): Promise<ManualSummary> {
  await ensureManualsSchema();
  const name = input.name.trim();
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType || 'application/octet-stream';

  if (!name) throw new Error('Manual name is required.');
  if (!fileName) throw new Error('Manual file name is required.');
  if (input.byteSize <= 0) throw new Error('Manual file is empty.');
  if (input.byteSize > MAX_MANUAL_BYTES) throw new Error('Manual file is too large. Keep uploads under 25 MB.');
  if (!isAcceptedManualFile(fileName, mimeType)) {
    throw new Error('Manual file must be a PDF, DOC, DOCX, TXT, or MD file.');
  }

  const created = await prisma.manual.create({
    data: {
      id: generateId(),
      name,
      fileName,
      mimeType,
      byteSize: input.byteSize,
      fileBytes: Buffer.from(input.bytes),
    },
  });

  return mapManual(created);
}

export async function getManualFile(manualId: string): Promise<ManualFile | null> {
  await ensureManualsSchema();
  const row = await prisma.manual.findUnique({
    where: { id: manualId },
    select: {
      fileName: true,
      mimeType: true,
      fileBytes: true,
    },
  });
  if (!row) return null;

  return {
    fileName: row.fileName,
    mimeType: row.mimeType,
    bytes: new Uint8Array(row.fileBytes),
  };
}
