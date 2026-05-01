import path from 'node:path';

export const DEFAULT_RAG_LLM_MODEL = 'deepseek/deepseek-v4-flash';
export const DEFAULT_RAG_OPENAI_LLM_MODEL = 'gpt-4o-mini';
export const DEFAULT_RAG_EMBEDDING_MODEL = 'text-embedding-3-large';
export type RagChatTask = 'answer' | 'query_parser' | 'metadata_extractor' | 'reranker' | 'long_context';
export type RagChatProvider = 'openai' | 'openrouter';
export type RagEmbeddingProvider = 'openai' | 'openrouter' | 'local';

export interface RagChatModelConfig {
  task: RagChatTask;
  provider: RagChatProvider;
  model: string;
  apiKeyPresent: boolean;
  baseUrl: string;
}

export function getStorageDir(): string {
  return process.env.STORAGE_DIR?.trim() || path.join(process.cwd(), '.local-storage');
}

export function getRagStorageDir(): string {
  return path.join(getStorageDir(), 'rag');
}

export function getEmbeddingModel(): string {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || DEFAULT_RAG_EMBEDDING_MODEL;
}

export function getEmbeddingProvider(): RagEmbeddingProvider {
  if (shouldUseLocalEmbeddings()) return 'local';
  const explicit = normalizeEmbeddingProvider(process.env.RAG_EMBEDDING_PROVIDER);
  if (explicit) return explicit;
  if (process.env.OPENROUTER_API_KEY?.trim()) return 'openrouter';
  return 'openai';
}

export function hasEmbeddingProvider(): boolean {
  if (shouldUseLocalEmbeddings()) return true;
  return Boolean(readEmbeddingProviderKey(getEmbeddingProvider()));
}

export function getAnswerModel(): string {
  return getChatModelConfig('answer').model;
}

export function getRerankModel(): string {
  return getChatModelConfig('reranker').model;
}

export function getQueryModel(): string {
  return getChatModelConfig('query_parser').model;
}

export function getMetadataModel(): string {
  return getChatModelConfig('metadata_extractor').model;
}

export function getLongContextModel(): string {
  return getChatModelConfig('long_context').model;
}

export function getOpenRouterBaseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

export function getChatModelConfig(task: RagChatTask): RagChatModelConfig {
  const provider = resolveProvider(task);
  const model = resolveModel(task, provider);
  return {
    task,
    provider,
    model,
    apiKeyPresent: Boolean(readProviderKey(provider)),
    baseUrl: provider === 'openrouter' ? getOpenRouterBaseUrl() : 'https://api.openai.com/v1',
  };
}

export function readProviderKey(provider: RagChatProvider): string {
  const key = provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  return key?.trim() || '';
}

export function readEmbeddingProviderKey(provider = getEmbeddingProvider()): string {
  if (provider === 'local') return 'local';
  const key = provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  return key?.trim() || '';
}

export function hasChatProvider(task: RagChatTask = 'answer'): boolean {
  const config = getChatModelConfig(task);
  return Boolean(config.model && config.apiKeyPresent);
}

export function isRerankerConfigured(): boolean {
  const providerSet = Boolean(process.env.RAG_RERANK_PROVIDER?.trim());
  const modelSet = Boolean(process.env.RAG_RERANK_MODEL?.trim());
  return (providerSet || modelSet || process.env.RAG_USE_LLM_RERANKER === 'true') && hasChatProvider('reranker');
}

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required for RAG storage.');
  const status = getDatabaseUrlStatus(value);
  if (!status.isPostgres) {
    throw new Error(status.message);
  }
  return value;
}

export function shouldUseLocalEmbeddings(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.RAG_LOCAL_EMBEDDINGS || '').toLowerCase());
}

export function getDatabaseUrlStatus(value = process.env.DATABASE_URL?.trim() || ''): {
  value: string;
  present: boolean;
  isPostgres: boolean;
  isSqlite: boolean;
  safeDisplay: string;
  message: string;
} {
  const trimmed = value.trim();
  const isSqlite = /^(file:|sqlite:)/i.test(trimmed) || /\.db(?:\?|$)/i.test(trimmed);
  const isPostgres = /^postgres(?:ql)?:\/\//i.test(trimmed);
  return {
    value: trimmed,
    present: Boolean(trimmed),
    isPostgres,
    isSqlite,
    safeDisplay: redactDatabaseUrl(trimmed),
    message: !trimmed
      ? 'RAG requires PostgreSQL with pgvector. DATABASE_URL is not set.'
      : isSqlite
        ? 'RAG requires PostgreSQL with pgvector. Your DATABASE_URL currently points to SQLite. Update .env to DATABASE_URL=postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app and restart the dev server.'
        : isPostgres
          ? 'DATABASE_URL is PostgreSQL.'
          : 'RAG requires PostgreSQL with pgvector. Set DATABASE_URL to a postgres:// or postgresql:// connection string.',
  };
}

function redactDatabaseUrl(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    if (url.username) url.username = url.username ? `${url.username}` : '';
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:\s]+):([^@\s]+)@/, '://$1:***@');
  }
}

function resolveProvider(task: RagChatTask): RagChatProvider {
  const explicit = taskProviderEnv(task);
  if (explicit) return explicit;

  const global = normalizeProvider(process.env.RAG_LLM_PROVIDER);
  if (global) return global;

  const model = taskModelEnv(task) || process.env.RAG_LLM_MODEL?.trim() || '';
  if (model.includes('/')) return 'openrouter';
  if (process.env.OPENROUTER_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) return 'openrouter';
  return 'openai';
}

function resolveModel(task: RagChatTask, provider: RagChatProvider): string {
  const taskModel = taskModelEnv(task);
  if (taskModel) return taskModel;
  const global = process.env.RAG_LLM_MODEL?.trim();
  if (global) return global;
  return provider === 'openrouter' ? DEFAULT_RAG_LLM_MODEL : DEFAULT_RAG_OPENAI_LLM_MODEL;
}

function taskProviderEnv(task: RagChatTask): RagChatProvider | '' {
  if (task === 'reranker') return normalizeProvider(process.env.RAG_RERANK_PROVIDER);
  return '';
}

function taskModelEnv(task: RagChatTask): string {
  switch (task) {
    case 'query_parser':
      return process.env.RAG_QUERY_MODEL?.trim() || '';
    case 'metadata_extractor':
      return process.env.RAG_METADATA_MODEL?.trim() || '';
    case 'reranker':
      return process.env.RAG_RERANK_MODEL?.trim() || '';
    case 'long_context':
      return process.env.RAG_LONG_CONTEXT_MODEL?.trim() || process.env.RAG_LLM_MODEL?.trim() || '';
    case 'answer':
    default:
      return process.env.RAG_LLM_MODEL?.trim() || '';
  }
}

function normalizeProvider(value: string | undefined): RagChatProvider | '' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'openrouter' || normalized === 'openai') return normalized;
  return '';
}

function normalizeEmbeddingProvider(value: string | undefined): Exclude<RagEmbeddingProvider, 'local'> | '' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'openrouter' || normalized === 'openai') return normalized;
  return '';
}
