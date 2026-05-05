import { afterEach, describe, expect, it } from 'vitest';
import { GET as getContacts } from '../../../app/api/outreach-crm/v1/contacts/route';
import { POST as openclawCallback } from '../../../app/api/outreach-crm/v1/openclaw/callback/route';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Outreach CRM service API auth boundary', () => {
  it('rejects contact reads without the internal bearer token', async () => {
    process.env.OUTREACH_CRM_SERVICE_TOKEN = 'service-token';
    const response = await getContacts(new Request('http://localhost/api/outreach-crm/v1/contacts') as any);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' });
  });

  it('rejects OpenClaw callbacks without Arrow HMAC headers', async () => {
    process.env.OUTREACH_CRM_WEBHOOK_SECRET = 'webhook-secret';
    const response = await openclawCallback(
      new Request('http://localhost/api/outreach-crm/v1/openclaw/callback', {
        method: 'POST',
        body: JSON.stringify({ jobId: 'job_123', status: 'completed' }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'missing_signature_headers' });
  });

});
