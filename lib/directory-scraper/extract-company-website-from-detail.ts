import type { Page } from 'playwright';
import { gotoDomContentLoaded } from './navigation-timeout';
import { sleep } from './utils';
import { assertPublicHttpUrl } from './validate-scrape-url';
import { getDirectoryScraperWorkerConfig } from './worker-config';

const BLOCKED_EXTERNAL_HOST_SNIPPETS = [
  'facebook',
  'twitter',
  'x.com',
  'linkedin',
  'instagram',
  'youtube',
  'google',
  'yelp',
  'bbb.org',
  'maps.',
  'tiktok',
  'pinterest',
  'specialtyfood.com',
];

interface RawAnchorFact {
  href: string;
  text: string;
  rowText: string;
  useHref: string;
  inNoise: boolean;
}

export interface DetailWebsiteCandidate {
  href: string;
  score: number;
  text: string;
  rowText: string;
}

export interface DetailWebsiteExtractionDebug {
  finalUrl: string;
  pageTitle: string;
  visibleTextHasUrl: boolean;
  topCandidates: DetailWebsiteCandidate[];
  error?: string;
}

export interface DetailWebsiteExtractionResult {
  website: string;
  debug: DetailWebsiteExtractionDebug;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isBlockedHost(host: string): boolean {
  return BLOCKED_EXTERNAL_HOST_SNIPPETS.some((snippet) => host.includes(snippet));
}

function isGoodExternal(href: string, pageHost: string): boolean {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:') && host !== pageHost && !isBlockedHost(host);
  } catch {
    return false;
  }
}

function scoreAnchor(anchor: RawAnchorFact, pageHost: string): DetailWebsiteCandidate | null {
  if (anchor.inNoise) return null;
  if (!isGoodExternal(anchor.href, pageHost)) return null;

  const text = normalizeText(anchor.text);
  const rowText = normalizeText(anchor.rowText);

  let score = 0;
  if (text.includes('http://') || text.includes('https://') || text.includes('www.')) score += 60;
  if (text.includes('.com') || text.includes('.co') || text.includes('.io') || text.includes('.net')) score += 30;
  if (rowText.length > 0) score += 25;
  if (rowText.includes('opens in a new window')) score += 5;
  if (anchor.useHref.includes('icon-globe')) score += 180;

  let hrefHost = '';
  try {
    hrefHost = new URL(anchor.href).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    hrefHost = '';
  }
  if (hrefHost && (text.includes(hrefHost) || rowText.includes(hrefHost))) score += 35;

  return {
    href: anchor.href,
    score,
    text,
    rowText: rowText.slice(0, 180),
  };
}

export async function extractCompanyWebsiteFromDetail(
  page: Page,
  detailUrl: string,
): Promise<DetailWebsiteExtractionResult> {
  try {
    const config = getDirectoryScraperWorkerConfig();
    assertPublicHttpUrl(detailUrl, 'Directory detail page');
    await gotoDomContentLoaded(page, detailUrl, config.websiteDiscoveryNavigationTimeoutMs);
    if (config.websiteDiscoverySettleMs > 0) {
      await sleep(config.websiteDiscoverySettleMs);
    }

    const finalUrl = page.url();
    const pageTitle = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    const pageHost = (() => {
      try {
        return new URL(finalUrl).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return '';
      }
    })();

    const rawAnchors = await page
      .$$eval('a[href]', (anchors) =>
        anchors.map((anchor) => {
          const el = anchor as HTMLAnchorElement;
          const row = el.closest(
            '.member-company__icon, .member-directory-listing__list-item-icon, .member-directory-listing__list-item-icon-container, .member-company, [class*="member-company"], [class*="member-directory"]',
          );
          const useEl = row?.querySelector('use');
          const inNoise = Boolean(
            el.closest(
              'header, footer, nav, aside, [class*="share"], [class*="breadcrumb"], [class*="header"], [class*="footer"], [class*="sponsor"], [class*="login"]',
            ),
          );
          return {
            href: el.href,
            text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
            rowText: (row?.textContent ?? '').replace(/\s+/g, ' ').trim(),
            useHref: useEl?.getAttribute('href') ?? useEl?.getAttribute('xlink:href') ?? '',
            inNoise,
          };
        }),
      )
      .catch(() => [] as RawAnchorFact[]);

    const candidates = rawAnchors
      .map((anchor) => scoreAnchor(anchor, pageHost))
      .filter((candidate): candidate is DetailWebsiteCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score);

    let website = candidates[0]?.href?.trim() ?? '';
    if (!website) {
      const urlMatches = bodyText.match(/https?:\/\/[^\s)]+/g) ?? [];
      for (const match of urlMatches) {
        if (isGoodExternal(match, pageHost)) {
          website = match;
          break;
        }
      }
    }

    return {
      website,
      debug: {
        finalUrl,
        pageTitle,
        visibleTextHasUrl: /https?:\/\/|www\./i.test(bodyText),
        topCandidates: candidates.slice(0, 5),
      },
    };
  } catch (error) {
    return {
      website: '',
      debug: {
        finalUrl: detailUrl,
        pageTitle: '',
        visibleTextHasUrl: false,
        topCandidates: [],
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
