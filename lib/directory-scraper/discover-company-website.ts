import { validateScrapeUrl } from './validate-scrape-url';
import { serperSearch, type SerperOrganicItem } from './serper-client';
import { normalizeDomain } from './utils';

const DIRECTORY_HOST_HINTS = [
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'yelp.com',
  'bbb.org',
  'google.com',
  'maps.google',
  'wikipedia.org',
  'crunchbase.com',
  'zoominfo.com',
  'dnb.com',
  'bloomberg.com',
  'indeed.com',
  'glassdoor.com',
];

function slugFromCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

function compactSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Domains to try with HEAD before calling Serper (no cost). */
export function guessDomainsForCompany(companyName: string): string[] {
  const base = slugFromCompanyName(companyName);
  const hyphen = compactSlug(companyName).replace(/-/g, '');
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (host: string) => {
    const h = host.toLowerCase().replace(/^www\./, '');
    if (h.length < 4 || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };

  if (base.length >= 4) {
    push(`${base}.com`);
    push(`${base}.co`);
    push(`${base}.io`);
  }
  if (hyphen.length >= 4 && hyphen !== base) {
    push(`${hyphen}.com`);
  }
  return out.slice(0, 6);
}

async function urlLooksReachable(url: string, signal?: AbortSignal): Promise<boolean> {
  const run = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : undefined,
      });
      return res.ok || res.status === 405 || res.status === 416;
    } finally {
      clearTimeout(t);
    }
  };
  try {
    const headOk = await run('HEAD');
    if (headOk) return true;
    return await run('GET');
  } catch {
    return false;
  }
}

function isBlockedDirectoryHost(host: string): boolean {
  const h = host.replace(/^www\./, '').toLowerCase();
  return DIRECTORY_HOST_HINTS.some((d) => h === d || h.endsWith(`.${d}`));
}

function pickBestOrganic(
  companyName: string,
  items: SerperOrganicItem[],
  directoryHost?: string,
): { url: string; reason: string } | null {
  const nameLower = companyName.toLowerCase();
  const nameTokens = new Set(
    nameLower
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2),
  );

  for (const item of items) {
    let u: URL;
    try {
      u = new URL(item.link);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (isBlockedDirectoryHost(host)) continue;
    if (directoryHost && normalizeDomain(`https://${host}`) === directoryHost) continue;

    const titleLower = item.title.toLowerCase();
    const snippetLower = (item.snippet ?? '').toLowerCase();
    const hostSlug = host.split('.')[0] ?? '';

    const titleHit = nameTokens.size > 0 && [...nameTokens].some((t) => titleLower.includes(t));
    const snippetHit = nameTokens.size > 0 && [...nameTokens].some((t) => snippetLower.includes(t));
    const hostHit =
      nameTokens.size > 0 &&
      [...nameTokens].some((t) => t.length >= 4 && (hostSlug.includes(t) || t.includes(hostSlug)));

    if (titleHit || snippetHit || hostHit) {
      return {
        url: u.origin + '/',
        reason: `Serper match: ${host} (${titleHit ? 'title' : snippetHit ? 'snippet' : 'host'})`,
      };
    }
  }

  for (const item of items) {
    let u: URL;
    try {
      u = new URL(item.link);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (isBlockedDirectoryHost(host)) continue;
    if (directoryHost && normalizeDomain(`https://${host}`) === directoryHost) continue;

    const v = validateScrapeUrl(u.href);
    if (!v.ok) continue;
    return { url: u.origin + '/', reason: `Serper first plausible: ${host}` };
  }

  return null;
}

export interface WebsiteDiscoveryResult {
  website: string;
  method: 'domain-guess' | 'serper' | 'none';
  detail: string;
  serperQuery?: string;
  candidatesTried: string[];
}

/**
 * Find a public company homepage: free domain HEAD checks first, then one Serper query.
 */
export async function discoverCompanyWebsite(
  companyName: string,
  options?: {
    directoryListingUrl?: string;
    signal?: AbortSignal;
  },
): Promise<WebsiteDiscoveryResult> {
  const candidatesTried: string[] = [];
  let directoryHost: string | undefined;
  if (options?.directoryListingUrl) {
    try {
      directoryHost = normalizeDomain(options.directoryListingUrl);
    } catch {
      /* ignore */
    }
  }

  for (const host of guessDomainsForCompany(companyName)) {
    const httpsUrl = `https://${host}/`;
    candidatesTried.push(httpsUrl);
    const v = validateScrapeUrl(httpsUrl);
    if (!v.ok) continue;
    if (await urlLooksReachable(httpsUrl, options?.signal)) {
      return {
        website: httpsUrl,
        method: 'domain-guess',
        detail: `HTTP check OK for ${host}`,
        candidatesTried,
      };
    }
  }

  const query = `"${companyName.trim()}" official website`;
  candidatesTried.push(`serper:${query}`);
  const serp = await serperSearch(query, { signal: options?.signal, num: 8 });
  if (serp.error && (!serp.organic || serp.organic.length === 0)) {
    return {
      website: '',
      method: 'none',
      detail: serp.error,
      serperQuery: query,
      candidatesTried,
    };
  }

  const picked = pickBestOrganic(companyName, serp.organic ?? [], directoryHost);
  if (picked) {
    const v = validateScrapeUrl(picked.url);
    if (v.ok) {
      return {
        website: picked.url,
        method: 'serper',
        detail: picked.reason,
        serperQuery: query,
        candidatesTried,
      };
    }
  }

  return {
    website: '',
    method: 'none',
    detail: serp.organic?.length ? 'No passing URL after Serper results' : 'No organic results',
    serperQuery: query,
    candidatesTried,
  };
}
