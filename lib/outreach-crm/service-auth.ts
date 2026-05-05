import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';
const DEFAULT_TOLERANCE_MS = 10 * 60 * 1000;

export interface OutreachAuthResult {
  ok: boolean;
  status: number;
  error?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

function headerValue(headers: Headers, name: string): string {
  return headers.get(name)?.trim() ?? '';
}

export function getOutreachServiceToken(): string {
  return env('OUTREACH_CRM_SERVICE_TOKEN');
}

export function getOutreachWebhookSecret(): string {
  return env('OUTREACH_CRM_WEBHOOK_SECRET') || getOutreachServiceToken();
}

export function authorizeOutreachServiceRequest(headers: Headers): OutreachAuthResult {
  const expected = getOutreachServiceToken();
  if (!expected) {
    return { ok: false, status: 503, error: 'outreach_service_token_unconfigured' };
  }

  const authorization = headerValue(headers, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const actual = match?.[1]?.trim() ?? '';
  if (!actual || !safeEqual(actual, expected)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  return { ok: true, status: 200 };
}

export function buildArrowSignature(rawBody: string, input?: { eventId?: string; timestamp?: string; secret?: string }) {
  const eventId = input?.eventId?.trim() || `evt_${Date.now()}`;
  const timestamp = input?.timestamp?.trim() || new Date().toISOString();
  const secret = input?.secret?.trim() || getOutreachWebhookSecret();
  if (!secret) throw new Error('OUTREACH_CRM_WEBHOOK_SECRET is not configured');

  const digest = createHmac('sha256', secret).update(`${eventId}.${timestamp}.${rawBody}`).digest('hex');
  return {
    eventId,
    timestamp,
    signature: `${SIGNATURE_PREFIX}${digest}`,
  };
}

export function verifyArrowWebhookSignature(
  rawBody: string,
  headers: Headers,
  options?: { toleranceMs?: number; now?: Date; secret?: string },
): OutreachAuthResult {
  const secret = options?.secret?.trim() || getOutreachWebhookSecret();
  if (!secret) return { ok: false, status: 503, error: 'outreach_webhook_secret_unconfigured' };

  const eventId = headerValue(headers, 'x-arrow-event-id');
  const timestamp = headerValue(headers, 'x-arrow-timestamp');
  const signature = headerValue(headers, 'x-arrow-signature');
  if (!eventId || !timestamp || !signature) {
    return { ok: false, status: 401, error: 'missing_signature_headers' };
  }

  const occurredAt = new Date(timestamp);
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false, status: 401, error: 'invalid_signature_timestamp' };
  }

  const toleranceMs = options?.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const now = options?.now ?? new Date();
  if (Math.abs(now.getTime() - occurredAt.getTime()) > toleranceMs) {
    return { ok: false, status: 401, error: 'signature_timestamp_outside_tolerance' };
  }

  const expected = buildArrowSignature(rawBody, { eventId, timestamp, secret }).signature;
  const normalizedActual = signature.startsWith(SIGNATURE_PREFIX) ? signature : `${SIGNATURE_PREFIX}${signature}`;
  if (!safeEqual(normalizedActual, expected)) {
    return { ok: false, status: 401, error: 'invalid_signature' };
  }

  return { ok: true, status: 200 };
}
