import { createHash } from 'node:crypto';

import {
  getChatModelConfig,
  getEmbeddingModel,
  getEmbeddingProvider,
  getOpenRouterBaseUrl,
  hasEmbeddingProvider,
  readEmbeddingProviderKey,
  readProviderKey,
  shouldUseLocalEmbeddings,
  type RagEmbeddingProvider,
  type RagChatProvider,
  type RagChatTask,
} from './config';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  provider: RagChatProvider;
  usage?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface RunChatCompletionInput {
  task: RagChatTask;
  messages: ChatMessage[];
  provider?: RagChatProvider;
  responseFormat?: 'json' | 'text';
  temperature?: number;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
}

export function assertEmbeddingProviderConfigured(): void {
  if (!hasEmbeddingProvider()) {
    throw new Error('A RAG embedding provider key is required. Set OPENROUTER_API_KEY for OpenRouter embeddings, OPENAI_API_KEY for OpenAI embeddings, or RAG_LOCAL_EMBEDDINGS=true only for local smoke tests.');
  }
}

export async function createEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; model: string }> {
  if (texts.length === 0) return { embeddings: [], model: getEmbeddingModel() };

  const provider = getEmbeddingProvider();
  const apiKey = readEmbeddingProviderKey(provider);
  if (!apiKey || provider === 'local') {
    if (shouldUseLocalEmbeddings() || provider === 'local') {
      return {
        embeddings: texts.map((text) => createLocalEmbedding(text)),
        model: 'local-hash-embedding',
      };
    }
    throw new Error(`${provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'} is required for RAG embeddings. Set RAG_LOCAL_EMBEDDINGS=true only for local smoke tests.`);
  }

  const model = getEmbeddingModelForProvider(provider);
  const url = provider === 'openrouter' ? `${getOpenRouterBaseUrl()}/embeddings` : OPENAI_EMBEDDINGS_URL;
  const headers = embeddingProviderHeaders(provider, apiKey);
  const embeddings: number[][] = [];
  const batchSize = 64;
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const payload = await postJson<{
      data?: Array<{ embedding: number[]; index: number }>;
    }>(
      url,
      headers,
      {
        model,
        input: batch,
      },
    );
    const sorted = [...(payload.data || [])].sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map((item) => item.embedding));
  }

  return { embeddings, model };
}

function getEmbeddingModelForProvider(provider: RagEmbeddingProvider): string {
  const model = getEmbeddingModel();
  if (provider === 'openrouter' && /^text-embedding-3-(small|large)$/i.test(model)) {
    return `openai/${model}`;
  }
  return model;
}

function embeddingProviderHeaders(provider: RagEmbeddingProvider, apiKey: string): Record<string, string> {
  if (provider === 'openrouter') return providerHeaders('openrouter', apiKey);
  return { Authorization: `Bearer ${apiKey}` };
}

export async function createQueryEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await createEmbeddings([text]);
    return result.embeddings[0] ?? null;
  } catch (error) {
    console.warn('[rag] query embedding unavailable:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function chatCompletion(input: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResult> {
  return runChatCompletion({
    task: 'answer',
    messages: input.messages,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
}

export async function runChatCompletion(input: RunChatCompletionInput): Promise<ChatCompletionResult> {
  const config = getChatModelConfig(input.task);
  const provider = input.provider || config.provider;
  const model = input.model || config.model;
  const apiKey = readProviderKey(provider);
  if (!apiKey) {
    throw new Error(
      provider === 'openrouter'
        ? `OPENROUTER_API_KEY is required for RAG ${input.task} model ${model}.`
        : `OPENAI_API_KEY is required for RAG ${input.task} model ${model}.`,
    );
  }

  const body = {
      model,
      messages: input.messages,
      temperature: input.temperature ?? 0.1,
      max_tokens: input.maxTokens ?? 1600,
      ...(input.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
  };
  const headers = providerHeaders(provider, apiKey);
  const url = provider === 'openrouter' ? `${getOpenRouterBaseUrl()}/chat/completions` : OPENAI_CHAT_URL;

  let payload: {
    model?: string;
    usage?: Record<string, unknown>;
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  try {
    payload = await postJson(url, headers, body, input.timeoutMs ?? 45_000);
  } catch (error) {
    if (input.responseFormat === 'json' && isResponseFormatUnsupported(error)) {
      try {
        payload = await postJson(url, headers, { ...body, response_format: undefined }, input.timeoutMs ?? 45_000);
      } catch (retryError) {
        throw decorateProviderError(provider, model, retryError);
      }
    } else {
      throw decorateProviderError(provider, model, error);
    }
  }

  const content = normalizeMessageContent(payload.choices?.[0]?.message?.content);
  if (!content) throw new Error(`${providerLabel(provider)} model ${model} returned empty content.`);
  return {
    content,
    model: payload.model || model,
    provider,
    usage: payload.usage,
    raw: payload as Record<string, unknown>,
  };
}

export async function rerankModelCompletion(messages: ChatMessage[]): Promise<string> {
  const result = await runChatCompletion({
    task: 'reranker',
    messages,
    responseFormat: 'json',
    temperature: 0,
    maxTokens: 2200,
  });
  return result.content;
}

export function extractJsonObject<T>(content: string): T | null {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 45_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let text = '';
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LLM provider request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = parseProviderJson(text);
  if (!response.ok) {
    throw new Error(providerErrorMessage(response.status, payload));
  }
  if (!payload) throw new Error('LLM provider returned invalid JSON.');
  return payload as T;
}

function parseProviderJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function providerHeaders(provider: RagChatProvider, apiKey: string): Record<string, string> {
  if (provider === 'openrouter') {
    return {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3002',
      'X-Title': 'Arrow Systems RAG Support Assistant',
    };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function providerErrorMessage(status: number, payload: Record<string, unknown> | null): string {
  const rawMessage = readProviderError(payload);
  if (status === 401 || status === 403) return `${rawMessage || 'LLM provider authentication failed.'}`;
  if (status === 404) return `${rawMessage || 'LLM model was not found or is unavailable.'}`;
  if (status === 408) return `${rawMessage || 'LLM provider request timed out.'}`;
  if (status === 429) return `${rawMessage || 'LLM provider rate limit reached.'}`;
  if (status >= 500) return `${rawMessage || 'LLM provider is temporarily unavailable.'}`;
  if (/model/i.test(rawMessage || '') && /not|invalid|unsupported/i.test(rawMessage || '')) {
    return rawMessage || 'Invalid or unsupported LLM model.';
  }
  return rawMessage || `LLM provider request failed with HTTP ${status}.`;
}

function readProviderError(payload: Record<string, unknown> | null): string {
  const error = payload?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.code === 'string') return candidate.code;
  }
  if (typeof payload?.message === 'string') return payload.message;
  return '';
}

function isResponseFormatUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /response_format|json_object|unsupported|not supported|invalid/i.test(message);
}

function providerLabel(provider: RagChatProvider): string {
  return provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
}

function decorateProviderError(provider: RagChatProvider, model: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(providerLabel(provider))) return error instanceof Error ? error : new Error(message);
  return new Error(`${providerLabel(provider)} ${model}: ${message}`);
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const candidate = item as Record<string, unknown>;
        return typeof candidate.text === 'string' ? candidate.text : '';
      })
      .join('')
      .trim();
  }
  return '';
}

function createLocalEmbedding(text: string): number[] {
  const dimensions = Number.parseInt(process.env.RAG_LOCAL_EMBEDDING_DIM || '1536', 10);
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const hash = createHash('sha256').update(token).digest();
    const index = hash.readUInt32BE(0) % dimensions;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(token.length, 16) / 16);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}
