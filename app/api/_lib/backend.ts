/**
 * Centralized outbound call to the mc-api Express service.
 *
 * On Cloud Run the API is deployed with --no-allow-unauthenticated, so every
 * request from mc-web must carry a Google-signed ID token minted against the
 * API's own URL (its audience). We fetch that token from the Cloud Run
 * metadata server and cache it in-memory until ~1 minute before expiry.
 *
 * Locally (no metadata server, or API_URL pointing at 127.0.0.1) this falls
 * back to unauthenticated fetches so `npm run dev` keeps working.
 */

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:3001';

const METADATA_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' } as const;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

function audienceFor(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function shouldAttachIdToken(url: string): boolean {
  if (process.env.DISABLE_ID_TOKEN === '1') return false;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    return host.endsWith('.run.app') || host.endsWith('.a.run.app');
  } catch {
    return false;
  }
}

async function fetchIdToken(audience: string): Promise<string | null> {
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt - Date.now() > 60_000) {
    return cached.token;
  }
  const url = `${METADATA_URL}?audience=${encodeURIComponent(audience)}&format=full`;
  try {
    const res = await fetch(url, {
      headers: METADATA_HEADERS,
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const token = (await res.text()).trim();
    if (!token) return null;
    tokenCache.set(audience, { token, expiresAt: Date.now() + 55 * 60 * 1000 });
    return token;
  } catch {
    return null;
  }
}

export function backendUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface BackendFetchInit extends RequestInit {
  /** Default: 'no-store'. Pass 'force-cache' etc. to override. */
  cache?: RequestCache;
}

export async function backendFetch(path: string, init: BackendFetchInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : backendUrl(path);
  const headers = new Headers(init.headers);

  if (shouldAttachIdToken(url) && !headers.has('authorization')) {
    const token = await fetchIdToken(audienceFor(url));
    if (token) headers.set('authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...init,
    headers,
    cache: init.cache ?? 'no-store',
  });
}

export async function fetchBackend<T>(path: string): Promise<T> {
  const res = await backendFetch(path);
  if (!res.ok) {
    throw new Error(`Backend request failed: ${res.status} ${res.statusText} (${backendUrl(path)})`);
  }
  return res.json() as Promise<T>;
}
