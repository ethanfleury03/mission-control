import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import { getDatabaseUrl } from './config';
import type {
  ChunkCandidate,
  DocumentType,
  ProductFamily,
  RagChunk,
  RagDocument,
  RagFilters,
  RagPage,
} from './types';

const globalForRagPg = globalThis as unknown as {
  ragPgPool: Pool | undefined;
};

function createPool(): Pool {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number.parseInt(process.env.RAG_DB_POOL_SIZE || '8', 10),
  });
}

export function getRagPool(): Pool {
  if (!globalForRagPg.ragPgPool) {
    globalForRagPg.ragPgPool = createPool();
  }
  return globalForRagPg.ragPgPool;
}

type DbExecutor = Pool | PoolClient;

export async function withRagClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getRagPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withRagClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

function asJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function mapDocument(row: QueryResultRow): RagDocument {
  return {
    id: row.id,
    filename: row.filename,
    originalPath: row.original_path ?? null,
    sourcePath: row.source_path ?? null,
    title: row.title,
    productFamily: row.product_family,
    productModel: row.product_model ?? '',
    documentType: row.document_type,
    version: row.version ?? '',
    softwareVersion: row.software_version ?? '',
    revisionDate: row.revision_date ? new Date(row.revision_date).toISOString().slice(0, 10) : null,
    sourceHash: row.source_hash,
    pageCount: Number(row.page_count ?? 0),
    status: row.status,
    metadata: asJson(row.metadata),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    chunkCount: row.chunk_count === undefined ? undefined : Number(row.chunk_count ?? 0),
    extractionQualityScore:
      row.extraction_quality_score === undefined ? undefined : Number(row.extraction_quality_score ?? 0),
    embeddingCount: row.embedding_count === undefined ? undefined : Number(row.embedding_count ?? 0),
  };
}

function mapPage(row: QueryResultRow): RagPage {
  return {
    id: row.id,
    documentId: row.document_id,
    pageNumber: Number(row.page_number),
    rawText: row.raw_text ?? '',
    ocrText: row.ocr_text ?? '',
    combinedText: row.combined_text ?? '',
    hasImages: Boolean(row.has_images),
    hasTables: Boolean(row.has_tables),
    extractionQualityScore: Number(row.extraction_quality_score ?? 0),
    metadata: asJson(row.metadata),
  };
}

export function mapChunk(row: QueryResultRow): RagChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title ?? row.title ?? '',
    filename: row.filename ?? '',
    pageStart: Number(row.page_start ?? 1),
    pageEnd: Number(row.page_end ?? row.page_start ?? 1),
    chunkIndex: Number(row.chunk_index ?? 0),
    headingPath: row.heading_path ?? '',
    text: row.text ?? '',
    tokenCount: Number(row.token_count ?? 0),
    productFamily: row.product_family,
    productModel: row.product_model ?? '',
    documentType: row.document_type,
    version: row.version ?? '',
    softwareVersion: row.software_version ?? '',
    revisionDate: row.revision_date ? new Date(row.revision_date).toISOString().slice(0, 10) : null,
    metadata: asJson(row.metadata),
  };
}

export function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(',')}]`;
}

function buildFilterClause(filters: RagFilters, startParamIndex: number): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let next = startParamIndex;

  if (filters.productFamily) {
    clauses.push(`(c.product_family = $${next} OR c.product_family = 'General')`);
    values.push(filters.productFamily);
    next += 1;
  }
  if (filters.productModel) {
    clauses.push(`LOWER(c.product_model) = LOWER($${next})`);
    values.push(filters.productModel);
    next += 1;
  }
  if (filters.documentType) {
    clauses.push(`c.document_type = $${next}`);
    values.push(filters.documentType);
    next += 1;
  }
  if (filters.version) {
    clauses.push(`LOWER(c.version) = LOWER($${next})`);
    values.push(filters.version);
    next += 1;
  }
  if (filters.softwareVersion) {
    clauses.push(`LOWER(c.software_version) = LOWER($${next})`);
    values.push(filters.softwareVersion);
    next += 1;
  }
  if (filters.documentId) {
    clauses.push(`c.document_id = $${next}::uuid`);
    values.push(filters.documentId);
    next += 1;
  }
  if (filters.documentIds && filters.documentIds.length > 0) {
    clauses.push(`c.document_id = ANY($${next}::uuid[])`);
    values.push(filters.documentIds);
    next += 1;
  }

  return {
    sql: clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : '',
    values,
  };
}

export async function findDocumentByHash(sourceHash: string): Promise<RagDocument | null> {
  const result = await getRagPool().query('SELECT * FROM documents WHERE source_hash = $1 LIMIT 1', [sourceHash]);
  return result.rows[0] ? mapDocument(result.rows[0]) : null;
}

export async function createIngestionJob(input: {
  sourcePath: string;
  filename: string;
  status?: string;
  batchId?: string;
  triggeredBy?: string;
}): Promise<string> {
  const result = await getRagPool().query(
    `INSERT INTO ingestion_jobs (source_path, filename, status, started_at, stats)
     VALUES ($1, $2, $3, NOW(), $4::jsonb)
     RETURNING id`,
    [
      input.sourcePath,
      input.filename,
      input.status || 'running',
      JSON.stringify({ batchId: input.batchId || '', triggeredBy: input.triggeredBy || 'local_user' }),
    ],
  );
  return result.rows[0].id;
}

export async function updateIngestionJob(
  jobId: string,
  input: {
    status: string;
    documentId?: string | null;
    errorMessage?: string | null;
    stats?: Record<string, unknown>;
  },
): Promise<void> {
  await getRagPool().query(
    `UPDATE ingestion_jobs
     SET status = $2,
         document_id = COALESCE($3, document_id),
         error_message = $4,
         stats = stats || COALESCE($5::jsonb, '{}'::jsonb),
         finished_at = CASE WHEN $2 IN ('completed', 'completed_with_warnings', 'needs_metadata_review', 'failed', 'skipped_duplicate', 'canceled') THEN NOW() ELSE finished_at END,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, input.status, input.documentId ?? null, input.errorMessage ?? null, input.stats ? JSON.stringify(input.stats) : null],
  );
}

export async function insertDocumentGraph(input: {
  document: {
    filename: string;
    originalPath: string | null;
    sourcePath: string | null;
    title: string;
    productFamily: ProductFamily;
    productModel: string;
    documentType: DocumentType;
    version: string;
    softwareVersion: string;
    revisionDate: string | null;
    sourceHash: string;
    pageCount: number;
    status: string;
    metadata: Record<string, unknown>;
  };
  pages: Array<{
    pageNumber: number;
    rawText: string;
    ocrText: string;
    combinedText: string;
    hasImages: boolean;
    hasTables: boolean;
    extractionQualityScore: number;
    metadata: Record<string, unknown>;
  }>;
  chunks: Array<{
    pageStart: number;
    pageEnd: number;
    chunkIndex: number;
    headingPath: string;
    text: string;
    tokenCount: number;
    productFamily: ProductFamily;
    productModel: string;
    documentType: DocumentType;
    version: string;
    softwareVersion: string;
    revisionDate: string | null;
    embedding: number[] | null;
    metadata: Record<string, unknown>;
  }>;
}): Promise<string> {
  return transaction(async (client) => {
    const docResult = await client.query(
      `INSERT INTO documents (
         filename, original_path, source_path, title, product_family, product_model, document_type,
         version, software_version, revision_date, source_hash, page_count, status, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11, $12, $13, $14::jsonb)
       RETURNING id`,
      [
        input.document.filename,
        input.document.originalPath,
        input.document.sourcePath,
        input.document.title,
        input.document.productFamily,
        input.document.productModel,
        input.document.documentType,
        input.document.version,
        input.document.softwareVersion,
        input.document.revisionDate,
        input.document.sourceHash,
        input.document.pageCount,
        input.document.status,
        JSON.stringify(input.document.metadata),
      ],
    );
    const documentId = docResult.rows[0].id as string;

    for (const page of input.pages) {
      await client.query(
        `INSERT INTO document_pages (
           document_id, page_number, raw_text, ocr_text, combined_text, has_images, has_tables,
           extraction_quality_score, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          documentId,
          page.pageNumber,
          page.rawText,
          page.ocrText,
          page.combinedText,
          page.hasImages,
          page.hasTables,
          page.extractionQualityScore,
          JSON.stringify(page.metadata),
        ],
      );
    }

    for (const chunk of input.chunks) {
      await client.query(
        `INSERT INTO document_chunks (
           document_id, page_start, page_end, chunk_index, heading_path, text, token_count,
           product_family, product_model, document_type, version, software_version, revision_date,
           embedding, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14::vector, $15::jsonb)`,
        [
          documentId,
          chunk.pageStart,
          chunk.pageEnd,
          chunk.chunkIndex,
          chunk.headingPath,
          chunk.text,
          chunk.tokenCount,
          chunk.productFamily,
          chunk.productModel,
          chunk.documentType,
          chunk.version,
          chunk.softwareVersion,
          chunk.revisionDate,
          chunk.embedding ? vectorLiteral(chunk.embedding) : null,
          JSON.stringify(chunk.metadata),
        ],
      );
    }

    return documentId;
  });
}

export async function listDocuments(): Promise<RagDocument[]> {
  const result = await getRagPool().query(
    `SELECT d.*,
            COUNT(DISTINCT c.id)::int AS chunk_count,
            COUNT(DISTINCT CASE WHEN c.embedding IS NOT NULL THEN c.id END)::int AS embedding_count,
            COALESCE(AVG(p.extraction_quality_score), 0)::float AS extraction_quality_score
     FROM documents d
     LEFT JOIN document_chunks c ON c.document_id = d.id
     LEFT JOIN document_pages p ON p.document_id = d.id
     GROUP BY d.id
     ORDER BY d.updated_at DESC, d.created_at DESC`,
  );
  return result.rows.map(mapDocument);
}

export async function getDocument(id: string): Promise<(RagDocument & { pages: RagPage[]; chunks: RagChunk[] }) | null> {
  const docResult = await getRagPool().query('SELECT * FROM documents WHERE id = $1', [id]);
  if (!docResult.rows[0]) return null;

  const [pageResult, chunkResult] = await Promise.all([
    getRagPool().query('SELECT * FROM document_pages WHERE document_id = $1 ORDER BY page_number ASC', [id]),
    getRagPool().query(
      `SELECT c.*, d.title AS document_title, d.filename
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.document_id = $1
       ORDER BY c.chunk_index ASC`,
      [id],
    ),
  ]);

  return {
    ...mapDocument(docResult.rows[0]),
    pages: pageResult.rows.map(mapPage),
    chunks: chunkResult.rows.map(mapChunk),
  };
}

export async function deleteDocument(id: string): Promise<boolean> {
  const result = await getRagPool().query('DELETE FROM documents WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateDocumentMetadata(
  id: string,
  patch: Partial<{
    title: string;
    productFamily: ProductFamily;
    productModel: string;
    documentType: DocumentType;
    version: string;
    softwareVersion: string;
    revisionDate: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<RagDocument | null> {
  const result = await transaction(async (client) => {
    const docResult = await client.query(
      `UPDATE documents
       SET title = COALESCE($2, title),
           product_family = COALESCE($3, product_family),
           product_model = COALESCE($4, product_model),
           document_type = COALESCE($5, document_type),
           version = COALESCE($6, version),
           software_version = COALESCE($7, software_version),
           revision_date = CASE WHEN $8 THEN $9::date ELSE revision_date END,
           metadata = COALESCE($10::jsonb, metadata),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.title ?? null,
        patch.productFamily ?? null,
        patch.productModel ?? null,
        patch.documentType ?? null,
        patch.version ?? null,
        patch.softwareVersion ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'revisionDate'),
        patch.revisionDate ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
      ],
    );

    if (!docResult.rows[0]) return null;

    await client.query(
      `UPDATE document_chunks
       SET product_family = COALESCE($2, product_family),
           product_model = COALESCE($3, product_model),
           document_type = COALESCE($4, document_type),
           version = COALESCE($5, version),
           software_version = COALESCE($6, software_version),
           revision_date = CASE WHEN $7 THEN $8::date ELSE revision_date END
       WHERE document_id = $1`,
      [
        id,
        patch.productFamily ?? null,
        patch.productModel ?? null,
        patch.documentType ?? null,
        patch.version ?? null,
        patch.softwareVersion ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'revisionDate'),
        patch.revisionDate ?? null,
      ],
    );

    return mapDocument(docResult.rows[0]);
  });

  return result;
}

export async function vectorSearch(input: {
  embedding: number[];
  filters: RagFilters;
  limit: number;
}): Promise<ChunkCandidate[]> {
  const filter = buildFilterClause(input.filters, 2);
  const result = await getRagPool().query(
    `SELECT c.*, d.title AS document_title, d.filename,
            GREATEST(0, 1 - (c.embedding <=> $1::vector)) AS vector_score,
            0::float AS keyword_score
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.embedding IS NOT NULL ${filter.sql}
     ORDER BY c.embedding <=> $1::vector
     LIMIT $${2 + filter.values.length}`,
    [vectorLiteral(input.embedding), ...filter.values, input.limit],
  );

  return result.rows.map((row) => ({
    ...mapChunk(row),
    vectorScore: Number(row.vector_score ?? 0),
    keywordScore: 0,
    combinedScore: Number(row.vector_score ?? 0),
    rerankScore: 0,
    rerankReason: '',
  }));
}

export async function keywordSearch(input: {
  query: string;
  filters: RagFilters;
  limit: number;
}): Promise<ChunkCandidate[]> {
  const filter = buildFilterClause(input.filters, 2);
  const result = await getRagPool().query(
    `SELECT c.*, d.title AS document_title, d.filename,
            0::float AS vector_score,
            ts_rank_cd(
              to_tsvector('english', coalesce(c.text, '') || ' ' || coalesce(c.heading_path, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.filename, '')),
              websearch_to_tsquery('english', $1)
            ) AS keyword_score
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE to_tsvector('english', coalesce(c.text, '') || ' ' || coalesce(c.heading_path, '') || ' ' || coalesce(d.title, '') || ' ' || coalesce(d.filename, ''))
           @@ websearch_to_tsquery('english', $1)
       ${filter.sql}
     ORDER BY keyword_score DESC
     LIMIT $${2 + filter.values.length}`,
    [input.query, ...filter.values, input.limit],
  );

  return result.rows.map((row) => ({
    ...mapChunk(row),
    vectorScore: 0,
    keywordScore: Number(row.keyword_score ?? 0),
    combinedScore: Number(row.keyword_score ?? 0),
    rerankScore: 0,
    rerankReason: '',
  }));
}

export async function createQueryRecord(input: {
  userQuery: string;
  parsedIntent: Record<string, unknown>;
  answer: string;
  confidence: number;
}): Promise<string> {
  const result = await getRagPool().query(
    `INSERT INTO queries (user_query, parsed_intent, answer, confidence)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING id`,
    [input.userQuery, JSON.stringify(input.parsedIntent), input.answer, input.confidence],
  );
  return result.rows[0].id;
}

export async function updateQueryRecord(input: {
  queryId: string;
  answer: string;
  confidence: number;
}): Promise<void> {
  await getRagPool().query('UPDATE queries SET answer = $2, confidence = $3 WHERE id = $1', [
    input.queryId,
    input.answer,
    input.confidence,
  ]);
}

export async function insertQueryResults(input: {
  queryId: string;
  results: ChunkCandidate[];
}): Promise<void> {
  for (let index = 0; index < input.results.length; index += 1) {
    const result = input.results[index];
    await getRagPool().query(
      `INSERT INTO query_results (query_id, chunk_id, vector_score, keyword_score, rerank_score, final_rank)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.queryId, result.id, result.vectorScore, result.keywordScore, result.rerankScore, index + 1],
    );
  }
}

export async function createFeedback(input: {
  queryId: string | null;
  rating: string;
  notes: string;
}): Promise<void> {
  await getRagPool().query(
    `INSERT INTO feedback (query_id, rating, notes)
     VALUES ($1, $2, $3)`,
    [input.queryId, input.rating, input.notes],
  );
}

export async function listFeedback(limit = 50): Promise<Array<Record<string, unknown>>> {
  const result = await getRagPool().query(
    `SELECT f.*, q.user_query, q.answer
     FROM feedback f
     LEFT JOIN queries q ON q.id = f.query_id
     ORDER BY f.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    queryId: row.query_id,
    rating: row.rating,
    notes: row.notes,
    userQuery: row.user_query,
    answer: row.answer,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function getDocumentPages(documentId: string): Promise<RagPage[]> {
  const result = await getRagPool().query(
    'SELECT * FROM document_pages WHERE document_id = $1 ORDER BY page_number ASC',
    [documentId],
  );
  return result.rows.map(mapPage);
}

export async function getDocumentChunks(documentId: string): Promise<RagChunk[]> {
  const result = await getRagPool().query(
    `SELECT c.*, d.title AS document_title, d.filename
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.document_id = $1
     ORDER BY c.chunk_index ASC`,
    [documentId],
  );
  return result.rows.map(mapChunk);
}

export async function getDashboardStats(): Promise<Record<string, unknown>> {
  const [docStats, productStats, typeStats, recentJobs, failedJobs, warningRows] = await Promise.all([
    getRagPool().query(
      `SELECT COUNT(DISTINCT d.id)::int AS total_documents,
              COALESCE(SUM(d.page_count), 0)::int AS total_pages,
              COUNT(c.id)::int AS total_chunks,
              COUNT(DISTINCT d.product_family)::int AS products_represented,
              MAX(d.updated_at) AS last_successful_ingestion
       FROM documents d
       LEFT JOIN document_chunks c ON c.document_id = d.id`,
    ),
    getRagPool().query(
      `SELECT product_family, COUNT(*)::int AS count
       FROM documents
       GROUP BY product_family
       ORDER BY count DESC, product_family ASC`,
    ),
    getRagPool().query(
      `SELECT document_type, COUNT(*)::int AS count
       FROM documents
       GROUP BY document_type
       ORDER BY count DESC, document_type ASC`,
    ),
    getRagPool().query(
      `SELECT *
       FROM ingestion_jobs
       ORDER BY created_at DESC
       LIMIT 8`,
    ),
    getRagPool().query(
      `SELECT *
       FROM ingestion_jobs
       WHERE status IN ('failed', 'completed_with_warnings', 'needs_metadata_review')
       ORDER BY created_at DESC
       LIMIT 8`,
    ),
    getRagPool().query(
      `SELECT
         COUNT(*) FILTER (WHERE product_family = 'General')::int AS missing_product,
         COUNT(*) FILTER (WHERE document_type = 'unknown')::int AS missing_document_type,
         COUNT(*) FILTER (WHERE revision_date IS NOT NULL AND revision_date < CURRENT_DATE - INTERVAL '5 years')::int AS stale_documents,
         COUNT(*) FILTER (WHERE status = 'needs_metadata_review')::int AS needs_metadata_review
       FROM documents`,
    ),
  ]);

  const lowQuality = await getRagPool().query(
    `SELECT COUNT(*)::int AS count
     FROM (
       SELECT document_id, AVG(extraction_quality_score) AS avg_quality
       FROM document_pages
       GROUP BY document_id
     ) q
     WHERE avg_quality < 0.35`,
  );
  const noEmbeddings = await getRagPool().query(
    `SELECT COUNT(*)::int AS count
     FROM documents d
     WHERE NOT EXISTS (
       SELECT 1 FROM document_chunks c
       WHERE c.document_id = d.id AND c.embedding IS NOT NULL
     )`,
  );

  return {
    totals: {
      totalDocuments: Number(docStats.rows[0]?.total_documents ?? 0),
      totalPages: Number(docStats.rows[0]?.total_pages ?? 0),
      totalChunks: Number(docStats.rows[0]?.total_chunks ?? 0),
      productsRepresented: Number(docStats.rows[0]?.products_represented ?? 0),
      lastSuccessfulIngestion: docStats.rows[0]?.last_successful_ingestion
        ? new Date(docStats.rows[0].last_successful_ingestion).toISOString()
        : null,
    },
    products: productStats.rows.map((row) => ({ label: row.product_family, count: Number(row.count) })),
    documentTypes: typeStats.rows.map((row) => ({ label: row.document_type, count: Number(row.count) })),
    recentJobs: recentJobs.rows.map(mapIngestionJob),
    failedJobs: failedJobs.rows.map(mapIngestionJob),
    warnings: {
      missingProduct: Number(warningRows.rows[0]?.missing_product ?? 0),
      missingDocumentType: Number(warningRows.rows[0]?.missing_document_type ?? 0),
      lowExtractionQuality: Number(lowQuality.rows[0]?.count ?? 0),
      noEmbeddings: Number(noEmbeddings.rows[0]?.count ?? 0),
      staleDocuments: Number(warningRows.rows[0]?.stale_documents ?? 0),
      needsMetadataReview: Number(warningRows.rows[0]?.needs_metadata_review ?? 0),
    },
  };
}

export function mapIngestionJob(row: QueryResultRow): Record<string, unknown> {
  const stats = asJson(row.stats);
  return {
    id: row.id,
    documentId: row.document_id ?? null,
    filename: row.filename ?? '',
    sourcePath: row.source_path ?? '',
    status: row.status ?? '',
    errorMessage: row.error_message ?? '',
    stats,
    batchId: typeof stats.batchId === 'string' ? stats.batchId : '',
    phase: typeof stats.phase === 'string' ? stats.phase : row.status,
    progress: typeof stats.progress === 'number' ? stats.progress : progressForStatus(row.status),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  };
}

export async function listIngestionJobs(limit = 100): Promise<Array<Record<string, unknown>>> {
  const result = await getRagPool().query(
    `SELECT *
     FROM ingestion_jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map(mapIngestionJob);
}

export async function getIngestionJob(id: string): Promise<Record<string, unknown> | null> {
  const result = await getRagPool().query('SELECT * FROM ingestion_jobs WHERE id = $1', [id]);
  return result.rows[0] ? mapIngestionJob(result.rows[0]) : null;
}

export async function cancelIngestionJob(id: string): Promise<boolean> {
  const result = await getRagPool().query(
    `UPDATE ingestion_jobs
     SET status = 'canceled',
         error_message = 'Canceled by user before background processing was available.',
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status IN ('queued', 'pending', 'running')
     RETURNING id`,
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findDocumentSource(id: string): Promise<{ filename: string; sourcePath: string | null; originalPath: string | null } | null> {
  const result = await getRagPool().query(
    'SELECT filename, source_path, original_path FROM documents WHERE id = $1',
    [id],
  );
  if (!result.rows[0]) return null;
  return {
    filename: result.rows[0].filename,
    sourcePath: result.rows[0].source_path,
    originalPath: result.rows[0].original_path,
  };
}

function progressForStatus(status: string): number {
  switch (status) {
    case 'completed':
    case 'completed_with_warnings':
    case 'needs_metadata_review':
    case 'skipped_duplicate':
      return 100;
    case 'failed':
    case 'canceled':
      return 100;
    case 'embedding':
      return 76;
    case 'indexing':
      return 88;
    case 'chunking':
      return 64;
    case 'detecting_metadata':
      return 52;
    case 'extracting':
      return 38;
    case 'uploaded':
      return 18;
    default:
      return 10;
  }
}
