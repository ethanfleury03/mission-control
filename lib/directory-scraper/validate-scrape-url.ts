/**
 * SSRF protection: block local/private/metadata targets for user-supplied scrape URLs.
 */

import { lookup as defaultLookup } from 'node:dns/promises';
import net from 'node:net';

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
const MAX_SAFE_FETCH_REDIRECTS = 5;

type LookupAddress = { address: string; family?: number };
type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

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
  const h = stripIpv6Brackets(host).toLowerCase();
  if (h === '::1') return true;
  if (h === '::') return true;
  if (h.startsWith('fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('::ffff:')) {
    const v4 = h.replace('::ffff:', '').split('%')[0];
    return isPrivateOrLoopbackIPv4(v4) || v4 === '127.0.0.1';
  }
  return false;
}

function stripIpv6Brackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function isBlockedIpAddress(address: string): boolean {
  const host = stripIpv6Brackets(address).toLowerCase();
  if (net.isIP(host) === 4) return isPrivateOrLoopbackIPv4(host);
  if (net.isIP(host) === 6) return isBlockedIPv6(host);
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

  const host = stripIpv6Brackets(url.hostname.toLowerCase());

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

  if (isBlockedIpAddress(host)) {
    return { ok: false, error: 'Private, loopback, and link-local IP addresses are not allowed.' };
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

export interface ValidateScrapeUrlNetworkOptions {
  lookup?: LookupFn;
}

export async function validateScrapeUrlPublic(
  raw: string,
  options: ValidateScrapeUrlNetworkOptions = {},
): Promise<ValidateScrapeUrlResult> {
  const base = validateScrapeUrl(raw);
  if (!base.ok || !base.normalizedUrl) return base;

  const url = new URL(base.normalizedUrl);
  const host = stripIpv6Brackets(url.hostname.toLowerCase());
  if (isBlockedIpAddress(host)) {
    return { ok: false, error: 'Private, loopback, and link-local IP addresses are not allowed.' };
  }
  if (net.isIP(host)) return base;

  const lookup = options.lookup || resolveHostname;
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, error: 'Could not resolve that public hostname.' };
  }

  if (addresses.length === 0) {
    return { ok: false, error: 'Could not resolve that public hostname.' };
  }

  if (addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    return { ok: false, error: 'That hostname resolves to a private or loopback address.' };
  }

  return base;
}

/** Throws if URL is not an allowed public http(s) target (use before Playwright navigation). */
export function assertPublicHttpUrl(url: string, context: string): void {
  const r = validateScrapeUrl(url);
  if (!r.ok) {
    throw new Error(`${context}: ${r.error ?? 'URL blocked'}`);
  }
}

export async function assertPublicHttpUrlAsync(url: string, context: string): Promise<void> {
  const r = await validateScrapeUrlPublic(url);
  if (!r.ok) {
    throw new Error(`${context}: ${r.error ?? 'URL blocked'}`);
  }
}

export async function fetchPublicHttpUrl(
  rawUrl: string,
  init: RequestInit = {},
  options: ValidateScrapeUrlNetworkOptions & { maxRedirects?: number } = {},
): Promise<Response> {
  let current = rawUrl;
  const maxRedirects = options.maxRedirects ?? MAX_SAFE_FETCH_REDIRECTS;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const validation = await validateScrapeUrlPublic(current, options);
    if (!validation.ok || !validation.normalizedUrl) {
      throw new Error(validation.error ?? 'URL blocked');
    }
    current = validation.normalizedUrl;
    const response = await fetch(current, { ...init, redirect: 'manual' });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current).toString();
  }

  throw new Error('Too many redirects while validating public URL.');
}

async function resolveHostname(hostname: string): Promise<LookupAddress[]> {
  return defaultLookup(hostname, { all: true, verbatim: true });
}
