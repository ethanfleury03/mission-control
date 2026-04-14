/**
 * Firecrawl API — single-page scrape for directory extraction.
 * Uses v1 /scrape; falls back to v2 /scrape if v1 returns 404.
 */

import * as cheerio from 'cheerio';
import { validateScrapeUrl } from './validate-scrape-url';
import { normalizeUrl } from './utils';
import type { PageLink } from './ai-locate-roster';

const V1_BASE = 'https://api.firecrawl.dev/v1';
const V2_BASE = 'https://api.firecrawl.dev/v2';

export interface FirecrawlScrapeSuccess {
  ok: true;
  finalUrl: string;
  title: string;
  html: string;
  markdown: string;
  /** Combined text for AI locate + blobs (markdown-first, HTML body fallback). */
  textForAi: string;
  links: PageLink[];
}

export interface FirecrawlScrapeFailure {
  ok: false;
  error: string;
}

export type FirecrawlScrapeResult = FirecrawlScrapeSuccess | FirecrawlScrapeFailure;

function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return ($('body').text() || $.root().text()).replace(/\s+/g, ' ').trim();
}

function extractLinksFromHtml(html: string, baseUrl: string): PageLink[] {
  const $ = cheerio.load(html);
  const out: PageLink[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    let abs: string;
    try {
      abs = normalizeUrl(href, baseUrl);
    } catch {
      return;
    }
    const v = validateScrapeUrl(abs);
    if (!v.ok || !v.normalizedUrl) return;
    abs = v.normalizedUrl;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ href: abs, text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200) || abs });
  });
  return out.slice(0, 400);
}

function parseLinksFromFirecrawlData(data: Record<string, unknown>, baseUrl: string): PageLink[] {
  const raw = data.links;
  if (!raw) return [];
  const out: PageLink[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const v = validateScrapeUrl(item);
        if (v.ok && v.normalizedUrl && !seen.has(v.normalizedUrl)) {
          seen.add(v.normalizedUrl);
          out.push({ href: v.normalizedUrl, text: v.normalizedUrl });
        }
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        const u = typeof o.url === 'string' ? o.url : typeof o.href === 'string' ? o.href : '';
        if (!u) continue;
        let abs: string;
        try {
          abs = normalizeUrl(u, baseUrl);
        } catch {
          continue;
        }
        const v = validateScrapeUrl(abs);
        if (!v.ok || !v.normalizedUrl) continue;
        if (seen.has(v.normalizedUrl)) continue;
        seen.add(v.normalizedUrl);
        const text =
          typeof o.text === 'string'
            ? o.text
            : typeof o.title === 'string'
              ? o.title
              : v.normalizedUrl;
        out.push({ href: v.normalizedUrl, text: text.slice(0, 200) });
      }
    }
  }
  return out;
}

function normalizeSuccess(
  requestUrl: string,
  data: Record<string, unknown>,
  html: string,
  markdown: string,
): FirecrawlScrapeSuccess {
  const meta = (data.metadata as Record<string, unknown> | undefined) ?? {};
  const title =
    (typeof meta.title === 'string' && meta.title) ||
    (typeof data.title === 'string' && data.title) ||
    '';
  const sourceUrl =
    (typeof meta.sourceURL === 'string' && meta.sourceURL) ||
    (typeof meta.url === 'string' && meta.url) ||
    requestUrl;

  const plain = html ? htmlToPlainText(html) : '';
  const md = typeof markdown === 'string' ? markdown.trim() : '';
  const textForAi = md.length > 200 ? md : plain || md;

  let links = parseLinksFromFirecrawlData(data, sourceUrl);
  if (links.length < 5 && html) {
    links = extractLinksFromHtml(html, sourceUrl);
  }

  return {
    ok: true,
    finalUrl: sourceUrl,
    title,
    html: typeof html === 'string' ? html : '',
    markdown: md,
    textForAi,
    links,
  };
}

export function isFirecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY?.trim();
}

/**
 * Scrape a public URL via Firecrawl. SSRF validation before request.
 */
export async function firecrawlScrape(url: string): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: 'FIRECRAWL_API_KEY is not set' };
  }

  const v = validateScrapeUrl(url);
  if (!v.ok) {
    return { ok: false, error: v.error ?? 'URL blocked' };
  }
  const target = v.normalizedUrl ?? url;

  const customBase = process.env.FIRECRAWL_BASE_URL?.trim();
  const bases = customBase ? [customBase.replace(/\/$/, '')] : [V1_BASE, V2_BASE];

  let lastError = 'Firecrawl request failed';

  for (const base of bases) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 95_000);
      const body = {
        url: target,
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: true,
        timeout: 90_000,
      };
      const res = await fetch(`${base}/scrape`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      clearTimeout(t);

      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : typeof json.message === 'string'
              ? json.message
              : `HTTP ${res.status}`;
        lastError = msg;
        if (res.status === 404 && !customBase) continue;
        return { ok: false, error: `Firecrawl: ${msg}` };
      }

      if (json.success === false) {
        lastError = typeof json.error === 'string' ? json.error : 'Firecrawl success=false';
        continue;
      }

      const data = (json.data as Record<string, unknown> | undefined) ?? json;
      const html = typeof data.html === 'string' ? data.html : '';
      const markdown = typeof data.markdown === 'string' ? data.markdown : '';
      if (!html && !markdown) {
        return { ok: false, error: 'Firecrawl returned no html or markdown' };
      }

      return normalizeSuccess(target, data, html, markdown);
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
      if (String(lastError).includes('abort')) {
        return { ok: false, error: 'Firecrawl request timed out' };
      }
    }
  }

  return { ok: false, error: lastError };
}
