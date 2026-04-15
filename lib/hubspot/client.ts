import { hubspotAccessToken } from './config';
import { isSearchablePhone, normalizePhoneDigits } from './phone';

const BASE = 'https://api.hubapi.com';

export class HubSpotApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
  ) {
    super(message);
    this.name = 'HubSpotApiError';
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type FetchOpts = { method: string; body?: unknown; retries?: number };

export async function hubspotFetch(path: string, opts: FetchOpts): Promise<Response> {
  const token = hubspotAccessToken();
  if (!token) throw new HubSpotApiError('HUBSPOT_ACCESS_TOKEN is not configured', 500);

  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const maxAttempts = (opts.retries ?? 3) + 1;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: opts.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 429 && attempt < maxAttempts - 1) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(Math.min(30_000, retryAfter * 1000));
      continue;
    }

    return res;
  }

  throw lastErr ?? new HubSpotApiError('HubSpot request failed after retries', 503);
}

/** Search contacts by email (CRM search API). */
export async function searchContactIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const res = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: {
      filterGroups: [
        {
          filters: [{ propertyName: 'email', operator: 'EQ', value: normalized }],
        },
      ],
      properties: ['email'],
      limit: 1,
    },
    retries: 2,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new HubSpotApiError(`HubSpot search failed: ${res.status}`, res.status, t);
  }

  const data = (await res.json()) as { results?: { id: string }[] };
  return data.results?.[0]?.id ?? null;
}

/** Search contacts by normalized phone (digits). HubSpot often stores E.164; search is best-effort. */
export async function searchContactIdByPhone(phone: string): Promise<string | null> {
  if (!isSearchablePhone(phone)) return null;
  const digits = normalizePhoneDigits(phone);

  const res = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: {
      filterGroups: [
        {
          filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: digits.slice(-10) }],
        },
      ],
      properties: ['phone'],
      limit: 3,
    },
    retries: 2,
  });

  if (!res.ok) {
    // Phone matching varies by portal formatting; ignore search errors and fall back to create.
    return null;
  }

  const data = (await res.json()) as { results?: { id: string; properties?: { phone?: string } }[] };
  const results = data.results ?? [];
  const tail = digits.slice(-10);
  for (const r of results) {
    const p = r.properties?.phone;
    if (p && normalizePhoneDigits(p).includes(tail)) {
      return r.id;
    }
  }
  return results[0]?.id ?? null;
}

export async function createContact(properties: Record<string, string>): Promise<{ id: string }> {
  const res = await hubspotFetch('/crm/v3/objects/contacts', {
    method: 'POST',
    body: { properties },
    retries: 2,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new HubSpotApiError(`HubSpot create contact failed: ${res.status}`, res.status, text);
  }
  const data = JSON.parse(text) as { id: string };
  return { id: data.id };
}

export async function patchContact(contactId: string, properties: Record<string, string>): Promise<void> {
  const res = await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
    method: 'PATCH',
    body: { properties },
    retries: 2,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new HubSpotApiError(`HubSpot patch contact failed: ${res.status}`, res.status, t);
  }
}
