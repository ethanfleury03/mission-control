/**
 * SSRF protection: block local/private/metadata targets for user-supplied scrape URLs.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal'];

function isIPv4(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

function parseIPv4Octets(s: string): number[] | null {
  if (!isIPv4(s)) return null;
  const p = s.split('.').map((x) => Number(x));
  return p.some((n) => Number.isNaN(n) || n < 0 || n > 255) ? null : p;
}

function isPrivateOrLoopbackIPv4(host: string): boolean {
  const p = parseIPv4Octets(host);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1') return true;
  if (h.startsWith('fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) {
    const v4 = h.replace('::ffff:', '').split('%')[0];
    return isPrivateOrLoopbackIPv4(v4) || v4 === '127.0.0.1';
  }
  return false;
}

export interface ValidateScrapeUrlResult {
  ok: boolean;
  error?: string;
  normalizedUrl?: string;
}

export function validateScrapeUrl(raw: string): ValidateScrapeUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'URL is required.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL. Use http:// or https:// with a public hostname.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are allowed.' };
  }

  if (url.username || url.password) {
    return { ok: false, error: 'URLs with embedded credentials are not allowed.' };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, error: 'That host is not allowed (localhost / loopback).' };
  }

  for (const suf of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suf)) {
      return { ok: false, error: 'That host is not allowed (reserved suffix).' };
    }
  }

  if (isPrivateOrLoopbackIPv4(host)) {
    return { ok: false, error: 'Private and loopback IP addresses are not allowed.' };
  }

  if (host.includes(':') && !host.includes('.')) {
    if (isBlockedIPv6(host)) {
      return { ok: false, error: 'Private or loopback IPv6 addresses are not allowed.' };
    }
  }

  const path = `${url.pathname}${url.search}`.toLowerCase();
  if (
    path.includes('/latest/meta-data') ||
    path.includes('169.254.169.254') ||
    path.includes('metadata.google.internal')
  ) {
    return { ok: false, error: 'Metadata and internal endpoints are not allowed.' };
  }

  return { ok: true, normalizedUrl: url.href };
}

/** Throws if URL is not an allowed public http(s) target (use before Playwright navigation). */
export function assertPublicHttpUrl(url: string, context: string): void {
  const r = validateScrapeUrl(url);
  if (!r.ok) {
    throw new Error(`${context}: ${r.error ?? 'URL blocked'}`);
  }
}
