import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

import {
  getChatModelConfig,
  getDatabaseUrlStatus,
  getEmbeddingModel,
  getEmbeddingProvider,
  getRagStorageDir,
  hasChatProvider,
  hasEmbeddingProvider,
  isRerankerConfigured,
} from './config';

export interface RagHealthCheck {
  name: string;
  ok: boolean;
  severity: 'info' | 'warning' | 'error';
  message: string;
  detail?: string;
}

export interface RagHealth {
  ok: boolean;
  ready: boolean;
  checkedAt: string;
  databaseUrl: {
    present: boolean;
    isPostgres: boolean;
    isSqlite: boolean;
    safeDisplay: string;
  };
  checks: RagHealthCheck[];
  summary: {
    documents: number;
    chunks: number;
    embeddings: number;
    failedDocuments: number;
    stuckJobs: number;
  };
  config: {
    chatProvider: string;
    chatModel: string;
    queryParserModel: string;
    metadataModel: string;
    rerankProvider: string;
    rerankModel: string;
    embeddingProvider: string;
    embeddingModel: string;
    openRouterKeyPresent: boolean;
    openAiKeyPresent: boolean;
    longContextModel: string;
    longContextConfigured: boolean;
  };
  nextSteps: string[];
}

const REQUIRED_TABLES = [
  'documents',
  'document_pages',
  'document_chunks',
  'ingestion_jobs',
  'queries',
  'query_results',
  'feedback',
];

export async function collectRagHealth(): Promise<RagHealth> {
  const checks: RagHealthCheck[] = [];
  const nextSteps: string[] = [];
  const database = getDatabaseUrlStatus();
  const summary = {
    documents: 0,
    chunks: 0,
    embeddings: 0,
    failedDocuments: 0,
    stuckJobs: 0,
  };
  const config = buildHealthConfig();

  checks.push({
    name: 'DATABASE_URL',
    ok: database.present && database.isPostgres,
    severity: database.present && database.isPostgres ? 'info' : 'error',
    message: database.message,
    detail: database.safeDisplay,
  });

  if (!database.present || !database.isPostgres) {
    nextSteps.push('Update .env so DATABASE_URL points to PostgreSQL with pgvector, then restart the dev server.');
  }

  const storageCheck = await checkStorageDir();
  checks.push(storageCheck);
  if (!storageCheck.ok) nextSteps.push('Set STORAGE_DIR to a writable local directory.');

  checks.push(checkEmbeddingProvider());
  checks.push(checkAnswerProvider());
  checks.push(checkRerankerProvider());
  checks.push(checkOcrStatus());

  if (database.present && database.isPostgres) {
    const dbChecks = await checkDatabase(database.value, summary);
    checks.push(...dbChecks.checks);
    nextSteps.push(...dbChecks.nextSteps);
  } else {
    checks.push(
      {
        name: 'Database connection',
        ok: false,
        severity: 'error',
        message: 'Skipped because DATABASE_URL is not PostgreSQL.',
      },
      {
        name: 'pgvector extension',
        ok: false,
        severity: 'error',
        message: 'Skipped because PostgreSQL is not configured.',
      },
      {
        name: 'RAG tables',
        ok: false,
        severity: 'error',
        message: 'Skipped because PostgreSQL is not configured.',
      },
    );
  }

  if (summary.documents === 0) {
    nextSteps.push('Ingest 5-10 known manuals before trusting support answers.');
  }
  if (summary.chunks > 0 && summary.embeddings === 0 && !hasEmbeddingProvider()) {
    nextSteps.push('Configure OPENAI_API_KEY for embeddings or set RAG_LOCAL_EMBEDDINGS=true for smoke tests.');
  }
  if (!hasEmbeddingProvider()) {
    nextSteps.push('Set OPENAI_API_KEY for production-quality embeddings.');
  }
  if (!hasChatProvider('answer')) {
    nextSteps.push(`Set ${config.chatProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'} for RAG chat answers.`);
  }
  if (config.longContextModel.includes(':free')) {
    nextSteps.push('Do not send confidential manuals to free long-context endpoints unless explicitly approved.');
  }

  const blocking = checks.some((check) => check.severity === 'error' && !check.ok);
  const ready =
    !blocking &&
    summary.documents > 0 &&
    summary.chunks > 0 &&
    (summary.embeddings > 0 || process.env.RAG_LOCAL_EMBEDDINGS === 'true');

  return {
    ok: !blocking,
    ready,
    checkedAt: new Date().toISOString(),
    databaseUrl: {
      present: database.present,
      isPostgres: database.isPostgres,
      isSqlite: database.isSqlite,
      safeDisplay: database.safeDisplay,
    },
    checks,
    summary,
    config,
    nextSteps: [...new Set(nextSteps)].slice(0, 8),
  };
}

async function checkDatabase(
  databaseUrl: string,
  summary: RagHealth['summary'],
): Promise<{ checks: RagHealthCheck[]; nextSteps: string[] }> {
  const checks: RagHealthCheck[] = [];
  const nextSteps: string[] = [];
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 1 });
  try {
    await pool.query('SELECT 1');
    checks.push({ name: 'Database connection', ok: true, severity: 'info', message: 'Connected to PostgreSQL.' });

    const extension = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    const hasVector = (extension.rowCount ?? 0) > 0;
    checks.push({
      name: 'pgvector extension',
      ok: hasVector,
      severity: hasVector ? 'info' : 'error',
      message: hasVector ? 'pgvector extension is installed.' : 'pgvector extension is missing. Run npm run rag:migrate.',
    });
    if (!hasVector) nextSteps.push('Run npm run rag:migrate after PostgreSQL is reachable.');

    const tableResult = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    const found = new Set(tableResult.rows.map((row) => String(row.table_name)));
    const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
    checks.push({
      name: 'RAG tables',
      ok: missing.length === 0,
      severity: missing.length === 0 ? 'info' : 'error',
      message: missing.length === 0 ? 'Required RAG tables exist.' : `Missing RAG tables: ${missing.join(', ')}.`,
    });
    if (missing.length > 0) nextSteps.push('Run npm run rag:migrate to create the RAG tables.');

    if (missing.length === 0) {
      const counts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM documents) AS documents,
           (SELECT COUNT(*)::int FROM document_chunks) AS chunks,
           (SELECT COUNT(*)::int FROM document_chunks WHERE embedding IS NOT NULL) AS embeddings,
           (SELECT COUNT(*)::int FROM documents WHERE status = 'failed') AS failed_documents,
           (SELECT COUNT(*)::int FROM ingestion_jobs WHERE status IN ('queued','pending','running','extracting','embedding','indexing','chunking','detecting_metadata') AND updated_at < NOW() - INTERVAL '30 minutes') AS stuck_jobs`,
      );
      summary.documents = Number(counts.rows[0]?.documents ?? 0);
      summary.chunks = Number(counts.rows[0]?.chunks ?? 0);
      summary.embeddings = Number(counts.rows[0]?.embeddings ?? 0);
      summary.failedDocuments = Number(counts.rows[0]?.failed_documents ?? 0);
      summary.stuckJobs = Number(counts.rows[0]?.stuck_jobs ?? 0);
      checks.push({
        name: 'Indexed content',
        ok: summary.documents > 0 && summary.chunks > 0,
        severity: summary.documents > 0 && summary.chunks > 0 ? 'info' : 'warning',
        message:
          summary.documents > 0 && summary.chunks > 0
            ? `${summary.documents} document(s) and ${summary.chunks} chunk(s) indexed.`
            : 'No manuals/chunks are indexed yet.',
      });
      checks.push({
        name: 'Embeddings',
        ok: summary.chunks === 0 || summary.embeddings > 0 || process.env.RAG_LOCAL_EMBEDDINGS === 'true',
        severity: summary.chunks === 0 || summary.embeddings > 0 || process.env.RAG_LOCAL_EMBEDDINGS === 'true' ? 'info' : 'warning',
        message:
          summary.embeddings > 0
            ? `${summary.embeddings} chunk embedding(s) are present.`
            : 'No embeddings found. Retrieval will be keyword-only until embeddings are configured.',
      });
      if (summary.stuckJobs > 0) {
        checks.push({
          name: 'Ingestion jobs',
          ok: false,
          severity: 'warning',
          message: `${summary.stuckJobs} ingestion job(s) look stuck for more than 30 minutes.`,
        });
      }
    }
  } catch (error) {
    checks.push({
      name: 'Database connection',
      ok: false,
      severity: 'error',
      message: 'Could not connect to PostgreSQL.',
      detail: error instanceof Error ? error.message : String(error),
    });
    nextSteps.push('Start Postgres with docker compose up -d postgres, then run npm run rag:migrate.');
  } finally {
    await pool.end().catch(() => undefined);
  }
  return { checks, nextSteps };
}

async function checkStorageDir(): Promise<RagHealthCheck> {
  const dir = getRagStorageDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.health-${process.pid}-${Date.now()}.tmp`);
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
    return {
      name: 'Storage directory',
      ok: true,
      severity: 'info',
      message: 'RAG storage directory is writable.',
      detail: dir,
    };
  } catch (error) {
    return {
      name: 'Storage directory',
      ok: false,
      severity: 'error',
      message: 'RAG storage directory is not writable.',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkEmbeddingProvider(): RagHealthCheck {
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const local = process.env.RAG_LOCAL_EMBEDDINGS === 'true';
  return {
    name: 'Embedding provider',
    ok: hasOpenAi || local,
    severity: hasOpenAi ? 'info' : local ? 'warning' : 'error',
    message: hasOpenAi
      ? `OpenAI embeddings configured (${getEmbeddingModel()}).`
      : local
        ? 'Local hash embeddings are enabled for smoke tests only.'
        : 'OPENAI_API_KEY is not set. Ingestion is blocked unless RAG_LOCAL_EMBEDDINGS=true is used for smoke tests.',
  };
}

function checkAnswerProvider(): RagHealthCheck {
  const answer = getChatModelConfig('answer');
  return {
    name: 'Answer model provider',
    ok: answer.apiKeyPresent,
    severity: answer.apiKeyPresent ? 'info' : 'error',
    message: answer.apiKeyPresent
      ? `Chat provider: ${providerLabel(answer.provider)} configured with model ${answer.model}.`
      : `${answer.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'} is required for RAG chat model ${answer.model}.`,
  };
}

function checkRerankerProvider(): RagHealthCheck {
  const wantsRerank = Boolean(process.env.RAG_RERANK_MODEL?.trim()) || process.env.RAG_USE_LLM_RERANKER === 'true';
  const reranker = getChatModelConfig('reranker');
  const configured = isRerankerConfigured();
  return {
    name: 'LLM reranker',
    ok: !wantsRerank || configured,
    severity: wantsRerank && !configured ? 'warning' : 'info',
    message: wantsRerank
      ? configured
        ? `LLM reranking is configured through ${providerLabel(reranker.provider)} (${reranker.model}).`
        : `LLM reranking was requested, but ${reranker.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'} is missing; deterministic reranking will be used.`
      : 'Deterministic reranking is active. Set RAG_RERANK_MODEL and a provider key for LLM reranking.',
  };
}

function checkOcrStatus(): RagHealthCheck {
  const enabled = process.env.RAG_OCR_ENABLED === 'true';
  return {
    name: 'OCR',
    ok: !enabled,
    severity: enabled ? 'warning' : 'info',
    message: enabled
      ? 'OCR is enabled in env, but this prototype currently flags OCR-needed pages instead of running a local OCR engine.'
      : 'OCR engine is not installed. Low-text/scanned pages will be flagged for review.',
  };
}

function buildHealthConfig(): RagHealth['config'] {
  const answer = getChatModelConfig('answer');
  const query = getChatModelConfig('query_parser');
  const metadata = getChatModelConfig('metadata_extractor');
  const rerank = getChatModelConfig('reranker');
  const longContext = getChatModelConfig('long_context');
  return {
    chatProvider: answer.provider,
    chatModel: answer.model,
    queryParserModel: `${providerLabel(query.provider)} / ${query.model}`,
    metadataModel: `${providerLabel(metadata.provider)} / ${metadata.model}`,
    rerankProvider: rerank.provider,
    rerankModel: rerank.model,
    embeddingProvider: getEmbeddingProvider(),
    embeddingModel: getEmbeddingModel(),
    openRouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
    longContextModel: process.env.RAG_LONG_CONTEXT_MODEL?.trim() || '',
    longContextConfigured: Boolean(process.env.RAG_LONG_CONTEXT_MODEL?.trim()),
  };
}

function providerLabel(provider: string): string {
  return provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
}
