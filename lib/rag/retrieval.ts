import { keywordSearch, vectorSearch } from './db';
import { isRerankerConfigured } from './config';
import { parseSupportQueryWithModel } from './metadata';
import { createQueryEmbedding, extractJsonObject, rerankModelCompletion } from './providers';
import { RERANKER_PROMPT } from './prompts/reranker';
import type { ChunkCandidate, ParsedSupportQuery, RagFilters, RagSearchDebug, SearchManualsInput } from './types';

export async function searchManuals(input: SearchManualsInput): Promise<{
  chunks: ChunkCandidate[];
  debug: RagSearchDebug;
  filters: RagFilters;
}> {
  const filters: RagFilters = {
    productFamily: input.productFamily,
    productModel: input.productModel,
    documentType: input.documentType,
    softwareVersion: input.softwareVersion,
    documentIds: input.restrictDocumentIds,
  };
  const debug = await searchRag({
    query: input.query,
    filters,
    topK: input.topK ?? 8,
    includeDebug: true,
  });
  return {
    chunks: debug.finalContext,
    debug,
    filters: debug.filtersApplied,
  };
}

export async function searchRag(input: {
  query: string;
  filters?: RagFilters;
  topK?: number;
  includeDebug?: boolean;
}): Promise<RagSearchDebug> {
  const parsedQuery = await parseSupportQueryWithModel(input.query, {
    productFamily: input.filters?.productFamily,
    documentType: input.filters?.documentType,
    version: input.filters?.version || input.filters?.softwareVersion,
  });
  const filtersApplied = buildFilters(input.query, parsedQuery, input.filters || {});
  const queryEmbedding = await createQueryEmbedding(input.query);

  const [vectorResults, keywordResults] = await Promise.all([
    queryEmbedding
      ? vectorSearch({
          embedding: queryEmbedding,
          filters: filtersApplied,
          limit: 40,
        }).catch((error) => {
          console.warn('[rag] vector search failed:', error instanceof Error ? error.message : error);
          return [];
        })
      : Promise.resolve([]),
    keywordSearch({
      query: buildKeywordQuery(input.query, parsedQuery),
      filters: filtersApplied,
      limit: 40,
    }).catch((error) => {
      console.warn('[rag] keyword search failed:', error instanceof Error ? error.message : error);
      return [];
    }),
  ]);

  const mergedResults = mergeAndScoreResults({
    query: input.query,
    parsedQuery,
    vectorResults,
    keywordResults,
  });
  const rerankedResults = await rerankCandidates(input.query, parsedQuery, mergedResults.slice(0, 35));
  const topK = input.topK ?? 8;
  const finalContext = rerankedResults.slice(0, topK);

  return {
    parsedQuery,
    filtersApplied,
    vectorResults,
    keywordResults,
    mergedResults,
    rerankedResults,
    finalContext,
  };
}

function buildFilters(query: string, parsed: ParsedSupportQuery, explicit: RagFilters): RagFilters {
  const filters: RagFilters = { ...explicit };
  if (!filters.productFamily && parsed.product_family && !isCrossProductQuery(query)) {
    filters.productFamily = parsed.product_family;
  }
  if (!filters.version && parsed.software_version) {
    filters.softwareVersion = parsed.software_version;
  }
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as RagFilters;
}

function isCrossProductQuery(query: string): boolean {
  const patterns = [
    /\bdura\s*-?\s*flex\b/i,
    /\bdura\s*-?\s*core\b/i,
    /\bdura\s*-?\s*bolt\b/i,
    /\bdura\s*-?\s*printer\b|\bmcs\b/i,
    /\bany\s*-?\s*jet\b|\bany-?002\b/i,
    /\bcutter\b|\bez\s*-?\s*cut\b|\bvr\s*series\b/i,
    /\brip\b/i,
  ];
  const found = patterns.filter((pattern) => pattern.test(query));
  return /\bcompare\b|\bacross\b|\bbetween\b/i.test(query) || found.length > 1;
}

function buildKeywordQuery(query: string, parsed: ParsedSupportQuery): string {
  const cleanQuery = query
    .replace(/\b(user|assistant)\s*:/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const additions = [
    parsed.product_family,
    parsed.product_model,
    parsed.software_version,
    parsed.document_type,
    ...parsed.error_codes,
    ...parsed.part_numbers,
    ...parsed.symptoms,
  ].filter(Boolean);
  return [...new Set([cleanQuery, ...additions])].join(' ');
}

function mergeAndScoreResults(input: {
  query: string;
  parsedQuery: ParsedSupportQuery;
  vectorResults: ChunkCandidate[];
  keywordResults: ChunkCandidate[];
}): ChunkCandidate[] {
  const byId = new Map<string, ChunkCandidate>();

  for (const result of input.vectorResults) {
    byId.set(result.id, { ...result });
  }

  for (const result of input.keywordResults) {
    const existing = byId.get(result.id);
    if (existing) {
      existing.keywordScore = Math.max(existing.keywordScore, result.keywordScore);
      existing.combinedScore = Math.max(existing.combinedScore, result.combinedScore);
    } else {
      byId.set(result.id, { ...result });
    }
  }

  const queryLower = input.query.toLowerCase();
  return [...byId.values()]
    .map((candidate) => {
      const keyword = Math.min(1, candidate.keywordScore * 3);
      const vector = Math.max(0, Math.min(1, candidate.vectorScore));
      const boost = metadataBoost(candidate, input.parsedQuery, queryLower);
      const combinedScore = vector * 0.48 + keyword * 0.32 + boost;
      const deterministicScore = Number(Math.min(1, combinedScore).toFixed(4));
      return {
        ...candidate,
        metadataBoost: Number(boost.toFixed(4)),
        deterministicScore,
        combinedScore: deterministicScore,
        rerankScore: deterministicScore,
        finalScore: deterministicScore,
        productMatches: !input.parsedQuery.product_family || candidate.productFamily === input.parsedQuery.product_family || candidate.productFamily === 'General',
        documentTypeMatches: !input.parsedQuery.document_type || candidate.documentType === input.parsedQuery.document_type,
        versionMatches:
          !input.parsedQuery.software_version ||
          candidate.softwareVersion.toLowerCase() === input.parsedQuery.software_version.toLowerCase() ||
          candidate.version.toLowerCase() === input.parsedQuery.software_version.toLowerCase(),
        directlyAnswers: containsDirectEvidence(candidate, input.parsedQuery, queryLower),
        rerankReason: `deterministic hybrid score: vector ${vector.toFixed(2)}, keyword ${keyword.toFixed(2)}, metadata boost ${boost.toFixed(2)}`,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

function metadataBoost(candidate: ChunkCandidate, parsed: ParsedSupportQuery, queryLower: string): number {
  let boost = 0;
  if (parsed.product_family && candidate.productFamily === parsed.product_family) boost += 0.12;
  if (parsed.product_family && candidate.documentTitle.toLowerCase().includes(parsed.product_family.toLowerCase())) boost += 0.06;
  if (parsed.document_type && candidate.documentType === parsed.document_type) boost += 0.08;
  if (parsed.software_version && candidate.softwareVersion.toLowerCase() === parsed.software_version.toLowerCase()) boost += 0.08;
  if (candidate.filename.toLowerCase().split(/[._\s-]+/).some((part) => queryLower.includes(part) && part.length > 4)) boost += 0.04;
  for (const exact of [...parsed.error_codes, ...parsed.part_numbers]) {
    if (candidate.text.toLowerCase().includes(exact.toLowerCase())) boost += 0.12;
  }
  for (const symptom of parsed.symptoms) {
    if (candidate.text.toLowerCase().includes(symptom.toLowerCase())) boost += 0.05;
  }
  if (parsed.intent === 'release_notes' && candidate.revisionDate) boost += 0.04;
  return boost;
}

async function rerankCandidates(
  query: string,
  parsedQuery: ParsedSupportQuery,
  candidates: ChunkCandidate[],
): Promise<ChunkCandidate[]> {
  if (candidates.length === 0) return [];
  if (!isRerankerConfigured()) {
    return candidates.sort((a, b) => b.rerankScore - a.rerankScore);
  }

  try {
    const content = await rerankModelCompletion([
      { role: 'system', content: RERANKER_PROMPT },
      {
        role: 'user',
        content: JSON.stringify(
          {
            query,
            parsedQuery,
            candidates: candidates.map((candidate) => ({
              id: candidate.id,
              title: candidate.documentTitle,
              filename: candidate.filename,
              productFamily: candidate.productFamily,
              documentType: candidate.documentType,
              version: candidate.version,
              softwareVersion: candidate.softwareVersion,
              pages: `${candidate.pageStart}-${candidate.pageEnd}`,
              text: candidate.text.slice(0, 1200),
            })),
          },
          null,
          2,
        ),
      },
    ]);
    const parsed = extractJsonObject<{
      results?: Array<{
        id: string;
        score: number;
        reason?: string;
        directAnswer?: boolean;
        productMatch?: boolean;
        docTypeMatch?: boolean;
        versionMatch?: boolean;
        directlyAnswers?: boolean;
        productMatches?: boolean;
        documentTypeMatches?: boolean;
        versionMatches?: boolean;
      }>;
    }>(content);
    const scores = new Map((parsed?.results || []).map((item) => [item.id, item]));
    return candidates
      .map((candidate) => {
        const score = scores.get(candidate.id);
        if (!score) return candidate;
        const llmRerankScore = Number(Math.max(0, Math.min(1, score.score)).toFixed(4));
        return {
          ...candidate,
          llmRerankScore,
          rerankScore: llmRerankScore,
          finalScore: llmRerankScore,
          directlyAnswers: Boolean(score.directAnswer ?? score.directlyAnswers),
          productMatches: Boolean(score.productMatch ?? score.productMatches),
          documentTypeMatches: Boolean(score.docTypeMatch ?? score.documentTypeMatches),
          versionMatches: Boolean(score.versionMatch ?? score.versionMatches),
          rerankReason: score.reason || 'LLM rerank',
        };
      })
      .sort((a, b) => b.rerankScore - a.rerankScore);
  } catch (error) {
    console.warn('[rag] rerank failed:', error instanceof Error ? error.message : error);
    return candidates.sort((a, b) => b.rerankScore - a.rerankScore);
  }
}

function containsDirectEvidence(candidate: ChunkCandidate, parsed: ParsedSupportQuery, queryLower: string): boolean {
  const text = candidate.text.toLowerCase();
  const exactEntities = [...parsed.error_codes, ...parsed.part_numbers, ...parsed.symptoms]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  if (exactEntities.some((entity) => text.includes(entity))) return true;
  const importantTerms = queryLower
    .split(/[^a-z0-9._-]+/)
    .filter((term) => term.length > 4 && !['where', 'which', 'manual', 'document', 'printer'].includes(term));
  const hits = importantTerms.filter((term) => text.includes(term)).length;
  return hits >= Math.min(3, importantTerms.length);
}
