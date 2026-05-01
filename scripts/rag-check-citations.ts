import { Pool } from 'pg';

import { getDatabaseUrlStatus } from '../lib/rag/config';
import { loadLocalEnv } from './rag-env';

interface Citation {
  document_id?: string;
  chunk_id?: string;
  page_start?: number;
  page_end?: number;
  quoted_text?: string;
}

async function main() {
  loadLocalEnv();
  const database = getDatabaseUrlStatus();
  if (!database.isPostgres) {
    console.error(database.message);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: database.value });
  const failures: string[] = [];
  let checked = 0;

  try {
    const queries = await pool.query(
      `SELECT id, user_query, parsed_intent
       FROM queries
       WHERE jsonb_typeof(parsed_intent #> '{agentDebug,citations}') = 'array'
       ORDER BY created_at DESC
       LIMIT 500`,
    );

    for (const query of queries.rows) {
      const citations = ((query.parsed_intent?.agentDebug?.citations || []) as Citation[]).filter(Boolean);
      for (const citation of citations) {
        checked += 1;
        if (!citation.document_id) failures.push(`${query.id}: citation missing document_id.`);
        if (!citation.chunk_id) failures.push(`${query.id}: citation missing chunk_id.`);
        if (!citation.quoted_text?.trim()) failures.push(`${query.id}: citation missing quote.`);
        if (!citation.page_start || !citation.page_end) failures.push(`${query.id}: citation missing page range.`);

        if (!citation.document_id || !citation.chunk_id || !citation.page_start || !citation.page_end) continue;
        const pageStart = citation.page_start;
        const pageEnd = citation.page_end;
        const result = await pool.query(
          `SELECT c.id, c.document_id, c.page_start, c.page_end, c.text, d.title
           FROM document_chunks c
           JOIN documents d ON d.id = c.document_id
           WHERE c.id = $1 AND c.document_id = $2`,
          [citation.chunk_id, citation.document_id],
        );
        const chunk = result.rows[0];
        if (!chunk) {
          failures.push(`${query.id}: cited chunk ${citation.chunk_id} does not exist for document ${citation.document_id}.`);
          continue;
        }
        if (pageStart < chunk.page_start || pageEnd > chunk.page_end) {
          failures.push(
            `${query.id}: citation pages ${pageStart}-${pageEnd} do not match chunk pages ${chunk.page_start}-${chunk.page_end}.`,
          );
        }
        if (citation.quoted_text && !normalize(chunk.text).includes(normalize(citation.quoted_text).slice(0, 80))) {
          failures.push(`${query.id}: quote was not found in cited chunk (${chunk.title}).`);
        }
        const pageCheck = await pool.query(
          `SELECT COUNT(*)::int AS count
          FROM document_pages
          WHERE document_id = $1 AND page_number BETWEEN $2 AND $3`,
          [citation.document_id, pageStart, pageEnd],
        );
        const expectedPages = pageEnd - pageStart + 1;
        if (Number(pageCheck.rows[0]?.count ?? 0) < expectedPages) {
          failures.push(`${query.id}: cited page range ${pageStart}-${pageEnd} has missing stored pages.`);
        }
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`Checked ${checked} citation(s).`);
  if (failures.length > 0) {
    console.log('');
    console.log('Citation failures:');
    for (const failure of failures.slice(0, 50)) console.log(`- ${failure}`);
    if (failures.length > 50) console.log(`- ...and ${failures.length - 50} more`);
    process.exit(1);
  }

  console.log('All checked citations reference existing chunks/pages and non-empty quotes.');
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
