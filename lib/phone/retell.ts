import crypto from 'crypto';
import type { PhoneAgentProfile } from './types';

const RETELL_API_BASE = 'https://api.retellai.com/v2';

export type RetellCallRecord = Record<string, unknown>;

export function getRetellApiKey(): string | null {
  return process.env.RETELL_API_KEY?.trim() || process.env.PHONE_RETELL_API_KEY?.trim() || null;
}

export function isRetellConfigured(profile?: PhoneAgentProfile | null): boolean {
  return Boolean(getRetellApiKey() && profile?.agentId && profile.outboundNumber);
}

function retellHeaders() {
  const apiKey = getRetellApiKey();
  if (!apiKey) throw new Error('RETELL_API_KEY is not configured');

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function retellRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${RETELL_API_BASE}${path}`, {
    ...init,
    headers: {
      ...retellHeaders(),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Retell API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function createRetellPhoneCall(input: {
  profile: PhoneAgentProfile;
  toNumber: string;
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, string>;
}): Promise<RetellCallRecord> {
  return retellRequest<RetellCallRecord>('/create-phone-call', {
    method: 'POST',
    body: JSON.stringify({
      from_number: input.profile.outboundNumber,
      to_number: input.toNumber,
      override_agent_id: input.profile.agentId,
      metadata: input.metadata,
      retell_llm_dynamic_variables: input.dynamicVariables,
      data_storage_setting: 'everything',
    }),
  });
}

export async function listRetellCalls(input: {
  agentIds: string[];
  lowerThresholdMs?: number;
  upperThresholdMs?: number;
  limit?: number;
  paginationKey?: string;
}): Promise<{ calls: RetellCallRecord[]; paginationKey: string | null }> {
  const payload: Record<string, unknown> = {
    limit: Math.min(1000, Math.max(1, input.limit ?? 100)),
    sort_order: 'descending',
    filter_criteria: {
      call_type: ['phone_call'],
      agent_id: input.agentIds,
    },
  };

  const filterCriteria = payload.filter_criteria as Record<string, unknown>;
  if (input.lowerThresholdMs || input.upperThresholdMs) {
    filterCriteria.start_timestamp = {
      ...(input.lowerThresholdMs ? { lower_threshold: input.lowerThresholdMs } : {}),
      ...(input.upperThresholdMs ? { upper_threshold: input.upperThresholdMs } : {}),
    };
  }
  if (input.paginationKey) payload.pagination_key = input.paginationKey;

  const response = await retellRequest<{ calls?: RetellCallRecord[]; pagination_key?: string | null }>(
    '/list-calls',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  return {
    calls: Array.isArray(response.calls) ? response.calls : [],
    paginationKey: typeof response.pagination_key === 'string' ? response.pagination_key : null,
  };
}

export async function getRetellCall(callId: string): Promise<RetellCallRecord> {
  return retellRequest<RetellCallRecord>(`/get-call/${encodeURIComponent(callId)}`, {
    method: 'GET',
  });
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function verifyRetellSignature(rawBody: string, signatureHeader: string | null): boolean {
  const apiKey = getRetellApiKey();
  if (!apiKey || !signatureHeader) return false;

  const signature = signatureHeader.trim();
  const hex = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
  const base64 = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  const candidates = [hex, base64, `sha256=${hex}`, `sha256=${base64}`];

  return candidates.some((candidate) => safeCompare(candidate, signature));
}
