/**
 * Parse directory listing HTML without a browser (tests + deterministic extraction).
 * Legacy HTML fixture helper (older card+heading heuristics). Live scrape uses extract-company-names pipeline.
 */
import * as cheerio from 'cheerio';
import type { DirectoryEntry } from './types';
import { normalizeUrl } from './utils';

interface EntryCandidate {
  name: string;
  href: string;
}

export function extractCandidatesFromHtml(html: string, baseUrl: string): EntryCandidate[] {
  const $ = cheerio.load(html);
  const candidates: EntryCandidate[] = [];
  const seen = new Set<string>();

  const cards = $(
    'article, [class*="card"], [class*="listing"], [class*="member"], [class*="company"], [class*="directory"], li',
  );
  cards.each((_, card) => {
    const $card = $(card);
    const link = $card.find('a[href]').first();
    const heading = $card.find('h1, h2, h3, h4, h5, h6, [class*="name"], [class*="title"]').first();
    if (link.length && heading.length) {
      const name = heading.text().trim();
      const href = link.attr('href') ?? '';
      const abs = normalizeUrl(href, baseUrl);
      if (name && abs && name.length < 200 && !seen.has(abs)) {
        seen.add(abs);
        candidates.push({ name, href: abs });
      }
    }
  });

  if (candidates.length < 3) {
    $('main a[href], .content a[href], #content a[href], table a[href]').each((_, el) => {
      const $a = $(el);
      const name = $a.text().trim();
      const href = $a.attr('href') ?? '';
      const abs = normalizeUrl(href, baseUrl);
      if (name && abs && name.length > 2 && name.length < 200 && !abs.includes('#') && !seen.has(abs)) {
        seen.add(abs);
        candidates.push({ name, href: abs });
      }
    });
  }

  return candidates;
}

export function findNextPageHref(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const trySelectors = [
    'a[rel="next"]',
    'a[aria-label*="next" i]',
    'a[class*="next" i]',
    'li.next > a',
    '.pagination a:last-child',
  ];
  for (const sel of trySelectors) {
    const href = $(sel).first().attr('href');
    if (href) return normalizeUrl(href, baseUrl);
  }
  const anchors = $('a').toArray();
  for (const el of anchors) {
    const $a = $(el);
    const text = $a.text().trim().toLowerCase();
    const href = $a.attr('href');
    if ((text === 'next' || text === 'next page' || text === '›' || text === '»' || text === '>') && href) {
      return normalizeUrl(href, baseUrl);
    }
  }
  return null;
}

export function parseDirectoryHtmlPages(
  pages: { html: string; url: string }[],
  maxEntries?: number,
): DirectoryEntry[] {
  const all: DirectoryEntry[] = [];
  const seenUrls = new Set<string>();
  const limit = maxEntries ?? 2000;

  for (const { html, url } of pages) {
    for (const c of extractCandidatesFromHtml(html, url)) {
      if (!seenUrls.has(c.href) && all.length < limit) {
        seenUrls.add(c.href);
        all.push({ name: c.name, url: c.href, detailUrl: c.href });
      }
    }
  }

  return all;
}
