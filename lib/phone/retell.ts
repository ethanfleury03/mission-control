import crypto from 'crypto';
import type { PhoneAgentProfile } from './types';

const RETELL_ROOT_API_BASE = 'https://api.retellai.com';
const RETELL_V2_API_BASE = `${RETELL_ROOT_API_BASE}/v2`;
const RETELL_V3_API_BASE = `${RETELL_ROOT_API_BASE}/v3`;

export type RetellCallRecord = Record<string, unknown>;
export type RetellAgentRecord = Record<string, unknown>;

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

async function retellRequest<T>(base: string, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
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
  return retellRequest<RetellCallRecord>(RETELL_V2_API_BASE, '/create-phone-call', {
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

export function buildRetellListCallsPayload(input: {
  agentIds?: string[];
  lowerThresholdMs?: number;
  upperThresholdMs?: number;
  limit?: number;
  paginationKey?: string;
}) {
  const filterCriteria: Record<string, unknown> = {};
  const agentIds = [...new Set((input.agentIds ?? []).map((id) => id.trim()).filter(Boolean))];

  if (agentIds.length) {
    filterCriteria.agent = agentIds.map((agentId) => ({ agent_id: agentId }));
  }
  if (input.lowerThresholdMs) {
    filterCriteria.start_timestamp = {
      type: 'number',
      op: 'ge',
      value: input.lowerThresholdMs,
    };
  } else if (input.upperThresholdMs) {
    filterCriteria.start_timestamp = {
      type: 'number',
      op: 'le',
      value: input.upperThresholdMs,
    };
  }

  return {
    limit: Math.min(1000, Math.max(1, input.limit ?? 100)),
    sort_order: 'descending',
    ...(Object.keys(filterCriteria).length ? { filter_criteria: filterCriteria } : {}),
    ...(input.paginationKey ? { pagination_key: input.paginationKey } : {}),
  };
}

export function normalizeRetellListCallsResponse(response: unknown): {
  calls: RetellCallRecord[];
  paginationKey: string | null;
  hasMore: boolean;
} {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.calls)
      ? record.calls
      : [];

  return {
    calls: items.filter((item): item is RetellCallRecord => Boolean(item && typeof item === 'object')),
    paginationKey: typeof record.pagination_key === 'string' ? record.pagination_key : null,
    hasMore: record.has_more === true,
  };
}

export async function listRetellCalls(input: {
  agentIds?: string[];
  lowerThresholdMs?: number;
  upperThresholdMs?: number;
  limit?: number;
  paginationKey?: string;
}): Promise<{ calls: RetellCallRecord[]; paginationKey: string | null; hasMore: boolean }> {
  const response = await retellRequest<unknown>(RETELL_V3_API_BASE, '/list-calls', {
    method: 'POST',
    body: JSON.stringify(buildRetellListCallsPayload(input)),
  });

  return normalizeRetellListCallsResponse(response);
}

export async function getRetellCall(callId: string): Promise<RetellCallRecord> {
  return retellRequest<RetellCallRecord>(RETELL_V2_API_BASE, `/get-call/${encodeURIComponent(callId)}`, {
    method: 'GET',
  });
}

export async function listRetellAgents(): Promise<RetellAgentRecord[]> {
  const params = new URLSearchParams({
    limit: '1000',
    is_latest: 'true',
  });
  const response = await retellRequest<unknown>(RETELL_ROOT_API_BASE, `/list-agents?${params.toString()}`, {
    method: 'GET',
  });

  if (Array.isArray(response)) {
    return response.filter((item): item is RetellAgentRecord => Boolean(item && typeof item === 'object'));
  }

  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : Array.isArray(record.agents) ? record.agents : [];
  return items.filter((item): item is RetellAgentRecord => Boolean(item && typeof item === 'object'));
}

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyTimestampedSignature(rawBody: string, signature: string, apiKey: string): boolean {
  const match = /^v=(\d+),d=([a-f0-9]+)$/i.exec(signature);
  if (!match) return false;

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(`${rawBody}${match[1]}`)
    .digest('hex');
  return safeCompare(expected, match[2]);
}

export function verifyRetellSignature(rawBody: string, signatureHeader: string | null): boolean {
  const apiKey = getRetellApiKey();
  if (!apiKey || !signatureHeader) return false;

  const signature = signatureHeader.trim();
  if (verifyTimestampedSignature(rawBody, signature, apiKey)) return true;

  const hex = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
  const base64 = crypto.createHmac('sha256', apiKey).update(rawBody).digest('base64');
  const candidates = [hex, base64, `sha256=${hex}`, `sha256=${base64}`];

  return candidates.some((candidate) => safeCompare(candidate, signature));
}
