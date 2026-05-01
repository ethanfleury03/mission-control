import { NextRequest, NextResponse } from 'next/server';

import { getDocumentChunks, listDocuments } from '@/lib/rag/db';
import { searchRag } from '@/lib/rag/retrieval';
import type { RagFilters } from '@/lib/rag/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Query is required.' }, { status: 400 });

  try {
    const filters: RagFilters = {
      documentId: normalizeFilter(body.documentId),
      productFamily: normalizeFilter(body.product || body.productFamily),
      documentType: normalizeFilter(body.documentType),
      version: normalizeFilter(body.version),
      softwareVersion: normalizeFilter(body.softwareVersion),
    };
    const debug = await searchRag({
      query,
      filters,
      topK: Number.isFinite(Number(body.topK)) ? Number(body.topK) : 8,
      includeDebug: true,
    });
    const expectedDocumentId = normalizeFilter(body.expectedDocumentId || body.expectedDocument);
    const expected = expectedDocumentId ? await analyzeExpectedDocument(expectedDocumentId, debug) : null;
    return NextResponse.json({ ...debug, expected });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not debug RAG search.' },
      { status: 500 },
    );
  }
}

function normalizeFilter(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function analyzeExpectedDocument(expectedInput: string, debug: Awaited<ReturnType<typeof searchRag>>) {
  const documents = await listDocuments();
  const expected =
    documents.find((document) => document.id === expectedInput) ||
    documents.find((document) =>
      `${document.title} ${document.filename}`.toLowerCase().includes(expectedInput.toLowerCase()),
    );
  if (!expected) {
    return {
      foundDocument: false,
      expectedInput,
      likelyReason: 'No indexed manual matched the expected document field.',
    };
  }

  const appearsIn = {
    vectorTopK: debug.vectorResults.some((result) => result.documentId === expected.id),
    keywordTopK: debug.keywordResults.some((result) => result.documentId === expected.id),
    mergedResults: debug.mergedResults.some((result) => result.documentId === expected.id),
    rerankedResults: debug.rerankedResults.some((result) => result.documentId === expected.id),
    finalContext: debug.finalContext.some((result) => result.documentId === expected.id),
  };
  const chunks = await getDocumentChunks(expected.id);
  const likelyReason = inferExpectedMissingReason({
    expected,
    appearsIn,
    chunksIndexed: chunks.length,
    filtersApplied: debug.filtersApplied,
  });

  return {
    foundDocument: true,
    document: {
      id: expected.id,
      title: expected.title,
      filename: expected.filename,
      productFamily: expected.productFamily,
      documentType: expected.documentType,
      chunkCount: chunks.length,
      extractionQualityScore: expected.extractionQualityScore,
    },
    appearsIn,
    likelyReason,
    sampleChunks: chunks.slice(0, 12).map((chunk) => ({
      ...chunk,
      vectorScore: 0,
      keywordScore: 0,
      combinedScore: 0,
      rerankScore: 0,
      rerankReason: 'Expected document chunk preview',
    })),
  };
}

function inferExpectedMissingReason(input: {
  expected: Awaited<ReturnType<typeof listDocuments>>[number];
  appearsIn: Record<string, boolean>;
  chunksIndexed: number;
  filtersApplied: RagFilters;
}): string {
  if (input.appearsIn.finalContext) return 'Expected document reached final context.';
  if (input.chunksIndexed === 0) return 'Expected document has no chunks indexed.';
  if (
    input.filtersApplied.productFamily &&
    input.expected.productFamily !== input.filtersApplied.productFamily &&
    input.expected.productFamily !== 'General'
  ) {
    return 'Metadata filter excluded it because the expected document product does not match the applied product filter.';
  }
  if (input.filtersApplied.documentType && input.expected.documentType !== input.filtersApplied.documentType) {
    return 'Metadata filter excluded it because the expected document type does not match the applied document-type filter.';
  }
  if (!input.appearsIn.vectorTopK && !input.appearsIn.keywordTopK) {
    return 'It did not appear in vector or keyword top K. Check extraction quality, metadata, and query wording.';
  }
  if (input.appearsIn.mergedResults && !input.appearsIn.rerankedResults) {
    return 'It appeared before reranking but was pushed down. Check reranker reasons and metadata boosts.';
  }
  if (input.appearsIn.rerankedResults && !input.appearsIn.finalContext) {
    return 'It reranked but did not make the final context window. Increase final context chunks or improve query specificity.';
  }
  return 'Expected document was not selected; inspect vector/keyword scores and metadata filters.';
}
