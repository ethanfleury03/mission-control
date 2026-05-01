import { ingestFolder, ingestLocalFile } from '../lib/rag/ingestion';
import { loadLocalEnv } from './rag-env';

async function main() {
  loadLocalEnv();
  const target = process.argv[2];
  if (!target) {
    throw new Error('Usage: npm run rag:ingest -- <folder-or-file> [--recursive]');
  }

  const recursive = process.argv.includes('--recursive') || process.argv.includes('-r');
  const stats = await import('node:fs/promises').then((fs) => fs.stat(target));
  const results = stats.isDirectory()
    ? await ingestFolder({ folderPath: target, recursive })
    : [await ingestLocalFile(target)];

  console.table(
    results.map((result) => ({
      status: result.status,
      filename: result.filename,
      pages: result.pageCount,
      chunks: result.chunkCount,
      documentId: result.documentId,
      message: result.message,
    })),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
