import { NextResponse } from 'next/server';

import { getChatModelConfig, getEmbeddingModel, getEmbeddingProvider, getOpenRouterBaseUrl } from '@/lib/rag/config';
import { collectRagHealth } from '@/lib/rag/health';
import { withActiveUser } from '../../_lib/with-active-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler() {
  const health = await collectRagHealth();
  const answer = getChatModelConfig('answer');
  const query = getChatModelConfig('query_parser');
  const metadata = getChatModelConfig('metadata_extractor');
  const rerank = getChatModelConfig('reranker');
  const longContext = getChatModelConfig('long_context');
  return NextResponse.json({
    settings: {
      chatProvider: answer.provider,
      answerModel: answer.model,
      queryParserProvider: query.provider,
      queryParserModel: query.model,
      metadataProvider: metadata.provider,
      metadataModel: metadata.model,
      rerankProvider: rerank.provider,
      rerankModel: rerank.model,
      longContextModel: process.env.RAG_LONG_CONTEXT_MODEL?.trim() || '',
      longContextConfigured: Boolean(process.env.RAG_LONG_CONTEXT_MODEL?.trim()),
      openRouterBaseUrl: getOpenRouterBaseUrl(),
      openRouterKeyPresent: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
      embeddingProvider: getEmbeddingProvider(),
      embeddingModel: getEmbeddingModel(),
      chunkTargetTokens: Number(process.env.RAG_CHUNK_TARGET_TOKENS || 950),
      chunkOverlapTokens: Number(process.env.RAG_CHUNK_OVERLAP_TOKENS || 140),
      topKVectorResults: Number(process.env.RAG_TOP_K_VECTOR || 40),
      topKKeywordResults: Number(process.env.RAG_TOP_K_KEYWORD || 40),
      finalContextChunks: Number(process.env.RAG_FINAL_CONTEXT_CHUNKS || 8),
      defaultProductFilterBehavior: process.env.RAG_PRODUCT_FILTER_MODE || 'strict_when_detected',
      ocrEnabled: process.env.RAG_OCR_ENABLED === 'true',
      autoMetadataDetection: process.env.RAG_AUTO_METADATA_DETECTION !== 'false',
      editable: false,
      storageDir: process.env.STORAGE_DIR || '.local-storage',
    },
    health,
  });
}

export const GET = withActiveUser(GETHandler);
