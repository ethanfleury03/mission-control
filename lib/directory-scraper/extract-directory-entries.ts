import type { Page } from 'playwright';
import type { DirectoryEntry } from './types';
import { normalizeUrl, sleep } from './utils';

const MAX_PAGES = 50;
const MAX_ENTRIES = 2000;

interface EntryCandidate {
  name: string;
  href: string;
}

async function extractCandidatesFromPage(page: Page): Promise<EntryCandidate[]> {
  return page.evaluate(() => {
    const candidates: { name: string; href: string }[] = [];
    const seen = new Set<string>();

    // Strategy 1: card-like containers with heading + link
    const cards = document.querySelectorAll(
      'article, [class*="card"], [class*="listing"], [class*="member"], [class*="company"], [class*="directory"], li'
    );
    for (const card of cards) {
      const link = card.querySelector('a[href]') as HTMLAnchorElement | null;
      const heading = card.querySelector('h1, h2, h3, h4, h5, h6, [class*="name"], [class*="title"]');
      if (link && heading) {
        const name = (heading.textContent ?? '').trim();
        const href = link.href;
        if (name && href && name.length < 200 && !seen.has(href)) {
          seen.add(href);
          candidates.push({ name, href });
        }
      }
    }

    // Strategy 2: repeated links in main content (table rows, plain lists)
    if (candidates.length < 3) {
      const mainLinks = document.querySelectorAll('main a[href], .content a[href], #content a[href], table a[href]');
      for (const a of mainLinks) {
        const el = a as HTMLAnchorElement;
        const name = (el.textContent ?? '').trim();
        const href = el.href;
        if (
          name &&
          href &&
          name.length > 2 &&
          name.length < 200 &&
          !href.includes('#') &&
          !seen.has(href)
        ) {
          seen.add(href);
          candidates.push({ name, href });
        }
      }
    }

    return candidates;
  });
}

function detectNextPageLink(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const selectors = [
      'a[rel="next"]',
      'a[aria-label*="next" i]',
      'a[class*="next" i]',
      'a:has(> [class*="next" i])',
      'li.next > a',
      '.pagination a:last-child',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel) as HTMLAnchorElement | null;
        if (el?.href) return el.href;
      } catch { /* selector may be invalid in some envs */ }
    }
    const anchors = Array.from(document.querySelectorAll('a'));
    for (const a of anchors) {
      const text = (a.textContent ?? '').trim().toLowerCase();
      if ((text === 'next' || text === 'next page' || text === '›' || text === '»' || text === '>') && a.href) {
        return a.href;
      }
    }
    return null;
  });
}

export async function extractDirectoryEntries(
  page: Page,
  startUrl: string,
  signal: () => boolean,
  maxEntries?: number,
): Promise<DirectoryEntry[]> {
  const all: DirectoryEntry[] = [];
  const seenUrls = new Set<string>();
  const seenPageUrls = new Set<string>();
  const limit = Math.min(maxEntries ?? MAX_ENTRIES, MAX_ENTRIES);

  let currentUrl = startUrl;
  let pageCount = 0;

  while (currentUrl && pageCount < MAX_PAGES && all.length < limit) {
    if (signal()) break;
    if (seenPageUrls.has(currentUrl)) break;
    seenPageUrls.add(currentUrl);

    try {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      await sleep(800);
    } catch (err: any) {
      break;
    }

    const candidates = await extractCandidatesFromPage(page);

    for (const c of candidates) {
      const normalized = normalizeUrl(c.href, currentUrl);
      if (!seenUrls.has(normalized) && all.length < limit) {
        seenUrls.add(normalized);
        all.push({
          name: c.name,
          url: normalized,
          detailUrl: normalized,
        });
      }
    }

    pageCount++;
    const nextUrl = await detectNextPageLink(page);
    if (!nextUrl || nextUrl === currentUrl) break;
    currentUrl = normalizeUrl(nextUrl, currentUrl);

    await sleep(1000);
  }

  return all;
}
