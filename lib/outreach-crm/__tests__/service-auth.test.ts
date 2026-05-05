import { afterEach, describe, expect, it } from 'vitest';
import {
  authorizeOutreachServiceRequest,
  buildArrowSignature,
  verifyArrowWebhookSignature,
} from '../service-auth';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Outreach CRM service auth', () => {
  it('requires the configured bearer token for service APIs', () => {
    process.env.OUTREACH_CRM_SERVICE_TOKEN = 'test-token';

    expect(authorizeOutreachServiceRequest(new Headers())).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      authorizeOutreachServiceRequest(
        new Headers({
          authorization: 'Bearer test-token',
        }),
      ),
    ).toMatchObject({ ok: true });
  });

  it('signs and verifies callback/webhook payloads', () => {
    process.env.OUTREACH_CRM_WEBHOOK_SECRET = 'test-secret';
    const rawBody = JSON.stringify({ jobId: 'job_123', status: 'completed' });
    const signed = buildArrowSignature(rawBody, {
      eventId: 'evt_123',
      timestamp: '2026-05-05T16:00:00.000Z',
    });
    const headers = new Headers({
      'x-arrow-event-id': signed.eventId,
      'x-arrow-timestamp': signed.timestamp,
      'x-arrow-signature': signed.signature,
    });

    expect(
      verifyArrowWebhookSignature(rawBody, headers, {
        now: new Date('2026-05-05T16:02:00.000Z'),
      }),
    ).toMatchObject({ ok: true });

    expect(
      verifyArrowWebhookSignature(`${rawBody}x`, headers, {
        now: new Date('2026-05-05T16:02:00.000Z'),
      }),
    ).toMatchObject({ ok: false, error: 'invalid_signature' });
  });
});
