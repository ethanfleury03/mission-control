import { validateScrapeUrl } from './validate-scrape-url';
import { serperSearch, type SerperOrganicItem } from './serper-client';
import { normalizeDomain } from './utils';

/** Only consider the first N organic results (Google-style top hits). */
const SERP_TOP_N = 5;

/** Minimum score (0–100) to accept a Serper hit; avoids unrelated "first link" picks. */
const SERP_MIN_SCORE = 38;

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

/** Tokens ignored when matching company name to search results. */
const NAME_STOPWORDS = new Set([
  'the', 'and', 'of', 'for', 'inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'co', 'plc', 'gmbh',
  'group', 'division', 'dba', 'd/b/a', 'na', 'usa', 'us', 'intl', 'international', 'north', 'america',
  'holdings', 'holding', 'systems', 'services', 'products', 'trading', 'ventures', 'partners', 'associates',
]);

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

function significantTokens(companyName: string): string[] {
  const raw = companyName
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
  return [...new Set(raw)];
}

function scoreOrganicItem(
  companyName: string,
  item: SerperOrganicItem,
  index: number,
  directoryHost?: string,
  rejectHosts?: Set<string>,
): { score: number; host: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(item.link);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (isBlockedDirectoryHost(host)) return null;
  if (rejectHosts?.has(host)) return null;
  if (directoryHost && host === directoryHost) return null;

  const tokens = significantTokens(companyName);
  if (tokens.length === 0) return null;

  const titleLower = item.title.toLowerCase();
  const snippetLower = (item.snippet ?? '').toLowerCase();
  const hostRoot = host.split('.')[0] ?? '';

  let score = 0;
  let titleHits = 0;
  let snippetHits = 0;
  let hostHits = 0;

  for (const t of tokens) {
    if (titleLower.includes(t)) {
      titleHits += 1;
      score += 22;
    }
    if (snippetLower.includes(t)) {
      snippetHits += 1;
      score += 10;
    }
    if (t.length >= 4 && (hostRoot.includes(t) || t.includes(hostRoot))) {
      hostHits += 1;
      score += 35;
    }
  }

  score = Math.min(100, score);

  const positionBonus = index === 0 ? 10 : index === 1 ? 6 : index === 2 ? 4 : index === 3 ? 2 : 0;
  score += positionBonus;

  if (titleHits === 0 && hostHits === 0 && snippetHits < 2) {
    score = Math.min(score, SERP_MIN_SCORE - 1);
  }

  const url = u.origin + '/';
  const v = validateScrapeUrl(url);
  if (!v.ok) return null;

  return { score, host, url };
}

/**
 * Pick best URL from top organic results only — no "first random plausible" fallback.
 */
function pickBestFromSerpTop(
  companyName: string,
  items: SerperOrganicItem[],
  directoryHost?: string,
  rejectHosts?: Set<string>,
): { url: string; reason: string; score: number } | null {
  const top = items.slice(0, SERP_TOP_N);
  let best: { score: number; url: string; reason: string } | null = null;

  for (let i = 0; i < top.length; i++) {
    const item = top[i];
    const scored = scoreOrganicItem(companyName, item, i, directoryHost, rejectHosts);
    if (!scored) continue;
    if (scored.score < SERP_MIN_SCORE) continue;
    if (!best || scored.score > best.score) {
      best = {
        score: scored.score,
        url: scored.url,
        reason: `Serper #${i + 1}/${SERP_TOP_N}: ${scored.host} (score ${scored.score})`,
      };
    }
  }

  return best;
}

export interface WebsiteDiscoveryResult {
  website: string;
  method: 'domain-guess' | 'serper' | 'none';
  detail: string;
  serperQuery?: string;
  candidatesTried: string[];
}

export interface DiscoverCompanyWebsiteOptions {
  directoryListingUrl?: string;
  signal?: AbortSignal;
  /** Reject these hostnames (e.g. job-wide placeholder like association consumer site). */
  rejectHosts?: string[];
}

function rejectHostSet(list?: string[]): Set<string> | undefined {
  if (!list?.length) return undefined;
  const s = new Set<string>();
  for (const h of list) {
    const n = h.replace(/^www\./, '').toLowerCase().trim();
    if (n) s.add(n);
  }
  return s.size ? s : undefined;
}

/**
 * Find a public company homepage:
 * 1) Serper — score top 5 organic results, require name alignment (no weak fallback).
 * 2) Domain guess — only if Serper fails; skips hosts in rejectHosts.
 */
export async function discoverCompanyWebsite(
  companyName: string,
  options?: DiscoverCompanyWebsiteOptions,
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
  const rejectHosts = rejectHostSet(options?.rejectHosts);

  const query = `${companyName.trim()} official website`;
  candidatesTried.push(`serper:${query}`);
  const serp = await serperSearch(query, { signal: options?.signal, num: SERP_TOP_N });
  if (serp.error && (!serp.organic || serp.organic.length === 0)) {
    return {
      website: '',
      method: 'none',
      detail: serp.error ?? 'No Serper results',
      serperQuery: query,
      candidatesTried,
    };
  }

  const picked = pickBestFromSerpTop(companyName, serp.organic ?? [], directoryHost, rejectHosts);
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

  for (const host of guessDomainsForCompany(companyName)) {
    if (rejectHosts?.has(host)) continue;
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

  return {
    website: '',
    method: 'none',
    detail:
      serp.organic?.length ?
        `No Serper hit above threshold (${SERP_MIN_SCORE}) in top ${SERP_TOP_N} results`
      : 'No organic results',
    serperQuery: query,
    candidatesTried,
  };
}

/** If one website domain appears on many rows, it's likely the listing org — re-resolve those rows. */
export function findDominantPlaceholderDomain(
  results: { companyWebsite?: string }[],
  opts?: { minShare?: number; minCount?: number },
): string | null {
  const minShare = opts?.minShare ?? 0.22;
  const minCount = opts?.minCount ?? 3;
  const counts = new Map<string, number>();
  let withSite = 0;
  for (const r of results) {
    const w = r.companyWebsite?.trim();
    if (!w) continue;
    try {
      const h = normalizeDomain(w);
      if (!h) continue;
      withSite += 1;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    } catch {
      /* ignore */
    }
  }
  if (withSite < minCount) return null;
  let bestHost = '';
  let best = 0;
  for (const [h, c] of counts) {
    if (c > best) {
      best = c;
      bestHost = h;
    }
  }
  if (best < minCount) return null;
  if (best / withSite < minShare) return null;
  return bestHost;
}
