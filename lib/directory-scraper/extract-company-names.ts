/**
 * Hybrid company-name extraction pipeline.
 *
 * Playwright path: collectRenderedPageArtifacts → runExtractionFromArtifactBundle
 * Firecrawl path: firecrawlScrape → runExtractionFromArtifactBundle (no local browser for fetch)
 */

import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { ExtractedCompanyCandidate, NameExtractionDebugSummary, NameExtractionMethod } from './types';
import { collectRenderedPageArtifacts, collectInnerTextForUrl } from './collect-rendered-page-artifacts';
import {
  discoverCandidateContainers,
  getTopContainerHtmlFragments,
  type CandidateContainer,
} from './discover-candidate-containers';
import { extractFromJsonLd, extractFromMicrodata } from './extract-from-structured-data';
import { extractFromTables } from './extract-from-tables';
import { extractFromRepeatedBlocks } from './extract-from-repeated-blocks';
import { extractFromLinkLists } from './extract-from-link-lists';
import { extractFromPlainText } from './extract-from-plain-text';
import { extractFromDetailLinks } from './extract-from-detail-links';
import { dedupeCompanyCandidates } from './dedupe-company-candidates';
import { isGroundedInPageText } from './ground-company-name';
import { isLikelyOrganizationName, scoreCompanyCandidate } from './score-company-candidates';
import { MAX_EXTRACTION_CANDIDATES } from './name-extraction-constants';
import type { CancelSignal } from './extract-directory-entries';
import { extractCompanyNamesFromTextBlobs, isAiExtractionAvailable } from './extract-with-ai';
import { locateRosterWithAi, collectSameOriginLinks, type PageLink } from './ai-locate-roster';
import type { FirecrawlScrapeSuccess } from './firecrawl-client';
import { firecrawlScrape } from './firecrawl-client';
import { sleep } from './utils';
import { collectPageLinks, extractPageRosterWithAi } from './ai-page-roster-extraction';

const DEFAULT_PAGINATION_PAGE_DELAY_MS = 700;
const DEFAULT_PAGINATION_CHALLENGE_DELAY_MS = 2200;
const DEFAULT_PAGINATION_ANTI_BOT_COOLDOWN_MS = 15000;
const DEFAULT_PAGINATION_CONCURRENCY = 3;
const DEFAULT_PAGINATION_ANTI_BOT_RETRY_LIMIT = 2;

type EmptyPageDiagnosis = {
  kind:
    | 'true-end-of-pagination'
    | 'anti-bot-or-rate-limit'
    | 'client-side-render-failure'
    | 'unknown-empty-page';
  detail: string;
  httpStatus?: number;
  httpItemCount?: number;
  fallbackHtml?: string;
};

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? '');
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

function getPaginationConcurrency(): number {
  return Math.max(1, Math.min(readPositiveIntEnv('SCRAPER_PAGINATION_CONCURRENCY', DEFAULT_PAGINATION_CONCURRENCY), 8));
}

function getPaginationPageDelayMs(): number {
  return Math.max(0, readPositiveIntEnv('SCRAPER_PAGINATION_DELAY_MS', DEFAULT_PAGINATION_PAGE_DELAY_MS));
}

function getPaginationChallengeDelayMs(): number {
  return Math.max(0, readPositiveIntEnv('SCRAPER_PAGINATION_CHALLENGE_DELAY_MS', DEFAULT_PAGINATION_CHALLENGE_DELAY_MS));
}

function getPaginationAntiBotCooldownMs(): number {
  return Math.max(1000, readPositiveIntEnv('SCRAPER_PAGINATION_ANTI_BOT_COOLDOWN_MS', DEFAULT_PAGINATION_ANTI_BOT_COOLDOWN_MS));
}

function getPaginationAntiBotRetryLimit(): number {
  return Math.max(0, Math.min(readPositiveIntEnv('SCRAPER_PAGINATION_ANTI_BOT_RETRY_LIMIT', DEFAULT_PAGINATION_ANTI_BOT_RETRY_LIMIT), 5));
}

function mergePageText(artifacts: { text: string; frames: { text: string }[] }): string {
  return [artifacts.text, ...artifacts.frames.map((f) => f.text)].join('\n');
}

/** Drop blobs that are fully contained in a larger blob (fewer duplicate chunks). */
function removeSubsumedBlobs(blobs: string[]): string[] {
  const trimmed = blobs.map((b) => b.trim()).filter((b) => b.length >= 30);
  if (trimmed.length <= 1) return trimmed;
  const sorted = [...trimmed].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const b of sorted) {
    if (kept.some((r) => r.includes(b))) continue;
    kept.push(b);
  }
  return kept;
}

function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/$/, '') || '/'}`;
  } catch {
    return u.split('#')[0];
  }
}

function setUrlSearchParam(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function isSpecialtyFoodDirectoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.replace(/^www\./, '').toLowerCase() === 'specialtyfood.com' &&
      parsed.pathname.includes('/membership/member-directory/')
    );
  } catch {
    return false;
  }
}

function extractSpecialtyFoodDirectoryCandidates(html: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(html || '<html></html>');
  const byName = new Map<string, ExtractedCompanyCandidate>();

  $('.member-directory-listing__list-item').each((index, item) => {
    const titleLink = $(item).find('.member-directory-listing__list-item-title a[href]').first();
    if (!titleLink.length) return;

    const href = titleLink.attr('href');
    const name = titleLink.text().replace(/\s+/g, ' ').trim();
    if (!href || !name) return;

    const absHref = normalizeUrlKey(new URL(href, sourceUrl).toString());
    const normalizedName = name
      .trim()
      .toLowerCase()
      .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\w\s&'-]/gi, '')
      .replace(/\s+/g, ' ');

    const candidate: ExtractedCompanyCandidate = {
      name,
      normalizedName,
      sourceUrl,
      sourceSelector: `.member-directory-listing__list-item:nth-of-type(${index + 1}) .member-directory-listing__list-item-title a`,
      sourceText: name,
      containerSelector: '.member-directory-listing__list-item',
      containerScore: 100,
      method: 'detail-link',
      confidence: 96,
      reasons: ['specialtyfood-fast-path', 'organization-detail-link'],
      listingUrl: absHref,
      detailUrl: absHref,
    };

    const existing = byName.get(normalizedName);
    if (!existing || candidate.confidence > existing.confidence) {
      byName.set(normalizedName, candidate);
    }
  });

  return [...byName.values()];
}

function countSpecialtyFoodListingItems(html: string): number {
  if (!html?.trim()) return 0;
  const $ = cheerio.load(html);
  return $('.member-directory-listing__list-item').length;
}

function detectAntiBotMarkers(html: string): string | null {
  const text = html.toLowerCase();
  const markers = [
    'access denied',
    'forbidden',
    'too many requests',
    'rate limit',
    'temporarily blocked',
    'verify you are human',
    'captcha',
    'cf-browser-verification',
    'cloudflare',
    'attention required',
    'request unsuccessful',
  ];
  const hit = markers.find((marker) => text.includes(marker));
  return hit ?? null;
}

async function fetchHtmlSnapshot(url: string): Promise<{ ok: boolean; status: number; html: string; finalUrl: string }> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
    });
    const html = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      html,
      finalUrl: response.url || url,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
    };
  }
}

async function diagnoseSpecialtyFoodEmptyPage(input: {
  pageUrl: string;
  finalUrl: string;
  pageTitle: string;
  playwrightText: string;
  playwrightLinkCount: number;
  skipHttpProbe?: boolean;
}): Promise<EmptyPageDiagnosis> {
  if (input.skipHttpProbe) {
    return {
      kind: 'anti-bot-or-rate-limit',
      detail: 'Challenge mode already active for this run, so later empty pages are being treated as anti-bot/rate-limit responses.',
      httpStatus: 0,
      httpItemCount: 0,
    };
  }
  const http = await fetchHtmlSnapshot(input.pageUrl);
  const antiBotMarker = detectAntiBotMarkers(http.html);
  const httpItemCount = countSpecialtyFoodListingItems(http.html);
  const normalizedTitle = (input.pageTitle ?? '').trim().toLowerCase();

  if (http.status === 403 || http.status === 429 || http.status === 503 || antiBotMarker) {
    return {
      kind: 'anti-bot-or-rate-limit',
      detail:
        antiBotMarker
          ? `Direct HTML fetch looks blocked or challenged (${antiBotMarker}).`
          : `Direct HTML fetch returned HTTP ${http.status}.`,
      httpStatus: http.status,
      httpItemCount,
      fallbackHtml: http.html,
    };
  }

  if (httpItemCount > 0) {
    return {
      kind: 'client-side-render-failure',
      detail: `Playwright saw an empty page, but direct HTML fetch still contains ${httpItemCount} listing item(s).`,
      httpStatus: http.status,
      httpItemCount,
      fallbackHtml: http.html,
    };
  }

  const httpLower = http.html.toLowerCase();
  if (httpLower.includes('no results') || httpLower.includes('no matching results') || httpLower.includes('0 results')) {
    return {
      kind: 'true-end-of-pagination',
      detail: 'Direct HTML fetch indicates no directory results on this page.',
      httpStatus: http.status,
      httpItemCount,
      fallbackHtml: http.html,
    };
  }

  if (
    normalizedTitle.includes('member directory') &&
    (httpLower.includes('member-directory-listing') || httpLower.includes('member-directory-listing-container'))
  ) {
    return {
      kind: 'unknown-empty-page',
      detail: 'Directory shell loaded but no listing rows were present in either Playwright or direct HTML.',
      httpStatus: http.status,
      httpItemCount,
      fallbackHtml: http.html,
    };
  }

  return {
    kind: 'unknown-empty-page',
    detail: 'Could not determine whether the empty result was pagination end, blocking, or render failure.',
    httpStatus: http.status,
    httpItemCount,
    fallbackHtml: http.html,
  };
}

function mergeStrategyCounts(
  left: Partial<Record<NameExtractionMethod, number>>,
  right: Partial<Record<NameExtractionMethod, number>>,
): Partial<Record<NameExtractionMethod, number>> {
  const merged = { ...left };
  for (const [method, count] of Object.entries(right) as Array<[NameExtractionMethod, number]>) {
    merged[method] = (merged[method] ?? 0) + count;
  }
  return merged;
}

function runFullDocumentStrategies(html: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const out: ExtractedCompanyCandidate[] = [];
  out.push(...extractFromJsonLd(html, sourceUrl));
  out.push(...extractFromMicrodata(html, sourceUrl));
  out.push(...extractFromTables(html, sourceUrl));
  out.push(...extractFromDetailLinks(html, sourceUrl));
  out.push(...extractFromRepeatedBlocks(html, sourceUrl));
  out.push(...extractFromLinkLists(html, sourceUrl));
  return out;
}

function runContainerStrategies(
  html: string,
  sourceUrl: string,
  containerMeta: { selectorPath: string; score: number },
): ExtractedCompanyCandidate[] {
  return [
    ...extractFromTables(html, sourceUrl),
    ...extractFromDetailLinks(html, sourceUrl, containerMeta),
    ...extractFromRepeatedBlocks(html, sourceUrl, containerMeta),
    ...extractFromLinkLists(html, sourceUrl, containerMeta),
    ...extractFromPlainText(html, sourceUrl, containerMeta),
  ];
}

function runDeterministicPipeline(
  html: string,
  frames: { html: string; url: string }[],
  fragments: { html: string; meta: { selectorPath: string; score: number } }[],
  finalUrl: string,
  fullText: string,
  maxCompanies?: number,
): { candidates: ExtractedCompanyCandidate[]; strategyCounts: Partial<Record<NameExtractionMethod, number>> } {
  const all: ExtractedCompanyCandidate[] = [];

  all.push(...runFullDocumentStrategies(html, finalUrl));
  for (const fr of frames) {
    all.push(...runFullDocumentStrategies(fr.html, fr.url || finalUrl));
  }
  for (const { html: frag, meta } of fragments) {
    all.push(...runContainerStrategies(frag, finalUrl, { selectorPath: meta.selectorPath, score: meta.score }));
  }

  const strategyCounts: Partial<Record<NameExtractionMethod, number>> = {};
  for (const c of all) {
    strategyCounts[c.method] = (strategyCounts[c.method] ?? 0) + 1;
  }

  const grounded: ExtractedCompanyCandidate[] = [];
  for (const c of all) {
    if (grounded.length >= MAX_EXTRACTION_CANDIDATES) break;
    const src = c.sourceText ?? c.name;
    if (!isGroundedInPageText(c.name, fullText) && !isGroundedInPageText(c.name, src)) continue;
    const likely = isLikelyOrganizationName(c.name, {
      hasExternalLink: !!c.companyWebsiteHint || (!!c.detailUrl && c.detailUrl !== c.listingUrl),
    });
    if (!likely.ok && c.method !== 'jsonld' && c.method !== 'microdata' && c.method !== 'table') continue;
    const scored = scoreCompanyCandidate({ ...c, confidence: c.confidence + (likely.ok ? 5 : 0) }, fullText);
    grounded.push({ ...c, confidence: scored.score, reasons: [...c.reasons, ...scored.reasons] });
  }

  let deduped = dedupeCompanyCandidates(grounded);
  if (maxCompanies && deduped.length > maxCompanies) {
    deduped = deduped.sort((a, b) => b.confidence - a.confidence).slice(0, maxCompanies);
  } else {
    deduped.sort((a, b) => b.confidence - a.confidence);
  }

  return { candidates: deduped, strategyCounts };
}

export interface PageArtifactBundle {
  /** Original job URL (for debug). */
  sourceUrl: string;
  finalUrl: string;
  title: string;
  html: string;
  /** Text used for grounding + AI locate (Playwright: innerText merge; Firecrawl: markdown + body plain). */
  fullText: string;
  iframeCount: number;
  loadMoreClicks: number;
  /** Optional: links from Firecrawl `links` format for pass 1. */
  prefetchedLinks?: PageLink[];
}

export type FollowUpFetchResult = { text: string; finalUrl?: string } | null;

export interface ExtractCompanyNamesOptions {
  sourceUrl: string;
  maxCompanies?: number;
  enableAiFallback?: boolean;
  cancelled?: CancelSignal;
  onLog?: (message: string) => void | Promise<void>;
}

export interface ExtractCompanyNamesResult {
  candidates: ExtractedCompanyCandidate[];
  debug: NameExtractionDebugSummary;
}

function makeEmptyResult(
  sourceUrl: string,
  finalUrl: string,
  pageTitle: string,
  explanation: string,
  iframeCount: number,
  loadMoreClicks: number,
): ExtractCompanyNamesResult {
  return {
    candidates: [],
    debug: {
      sourceUrl,
      finalUrl,
      pageTitle,
      zeroResultExplanation: explanation,
      topContainers: [],
      strategyCounts: {},
      aiFallbackUsed: false,
      iframeCount,
      loadMoreClicks,
    },
  };
}

function mapContainer(c: CandidateContainer) {
  return {
    selectorPath: c.selectorPath,
    tagName: c.tagName,
    classIdSummary: c.classIdSummary,
    textLength: c.textLength,
    linkCount: c.linkCount,
    repeatedChildSummary: c.repeatedChildSummary,
    keywordHits: c.keywordHits,
    score: c.score,
    scoreReasons: c.scoreReasons,
  };
}

/**
 * Core pipeline after page content is available (Playwright or Firecrawl).
 */
export async function runExtractionFromArtifactBundle(
  bundle: PageArtifactBundle,
  options: ExtractCompanyNamesOptions & {
    fetchFollowUpUrl: (url: string) => Promise<FollowUpFetchResult>;
  },
): Promise<ExtractCompanyNamesResult> {
  const { sourceUrl, maxCompanies, enableAiFallback, onLog } = options;
  const cancelled = options.cancelled;

  const log = async (msg: string) => {
    if (onLog) await Promise.resolve(onLog(msg));
  };

  const { finalUrl, title, html, fullText } = bundle;
  const topContainers = discoverCandidateContainers(html, finalUrl).slice(0, 15);
  const fragments = getTopContainerHtmlFragments(html, 12);

  /** JSON-LD / microdata on directory pages often lists only a few orgs (e.g. NCA itself). Never short-circuit — merge with full roster extraction. */
  const structuredCandidates: ExtractedCompanyCandidate[] = [
    ...extractFromJsonLd(html, finalUrl),
    ...extractFromMicrodata(html, finalUrl),
  ].filter((c) => isGroundedInPageText(c.name, fullText));

  const useAi = enableAiFallback && isAiExtractionAvailable();

  if (useAi) {
    if (cancelled && (await Promise.resolve(cancelled()))) {
      return makeEmptyResult(
        sourceUrl,
        finalUrl,
        title,
        'Cancelled before AI extraction',
        bundle.iframeCount,
        bundle.loadMoreClicks,
      );
    }

    await log('AI pass 1: locating roster URLs and text regions…');
    const links =
      bundle.prefetchedLinks && bundle.prefetchedLinks.length > 0
        ? bundle.prefetchedLinks
        : collectSameOriginLinks(html, finalUrl);
    const locate = await locateRosterWithAi({
      baseUrl: finalUrl,
      pageTitle: title,
      visibleText: fullText,
      links,
    });

    if (locate.error) {
      await log(`AI pass 1 warning: ${locate.error}`);
    } else {
      await log(
        `AI pass 1 done: ${locate.rosterUrls.length} URL(s), ${locate.textSpans.length} text span(s) (${locate.modelUsed})`,
      );
    }

    const blobs: string[] = [...locate.textSpans];
    let extraPagesFetched = 0;
    const seedKey = normalizeUrlKey(finalUrl);

    for (const url of locate.rosterUrls) {
      if (extraPagesFetched >= 3) break;
      if (cancelled && (await Promise.resolve(cancelled()))) break;
      if (normalizeUrlKey(url) === seedKey) continue;

      await log(`Fetching roster page: ${url.slice(0, 80)}…`);
      const fetched = await options.fetchFollowUpUrl(url);
      if (fetched && fetched.text.trim().length > 50) {
        blobs.push(fetched.text);
        extraPagesFetched++;
      }
    }

    if (blobs.length === 0) {
      blobs.push(fullText);
      await log('AI pass 1: no spans/URLs — using full page text for extraction.');
    }

    const filteredBlobs = removeSubsumedBlobs(blobs);

    await log(`AI pass 2: extracting names from ${filteredBlobs.length} text region(s)…`);
    const aiResult = await extractCompanyNamesFromTextBlobs(filteredBlobs, {
      sourceUrl: finalUrl,
      pageTitle: title,
    });

    await log(
      aiResult.error
        ? `AI pass 2 error: ${aiResult.error}`
        : `AI pass 2 done: ${aiResult.candidates.length} companies (${aiResult.chunksProcessed ?? 0} chunk(s))`,
    );

    const allCandidates = dedupeCompanyCandidates([...structuredCandidates, ...aiResult.candidates]);
    let final = maxCompanies ? allCandidates.slice(0, maxCompanies) : allCandidates;

    const strategyCounts: Partial<Record<NameExtractionMethod, number>> = {};
    for (const c of final) {
      strategyCounts[c.method] = (strategyCounts[c.method] ?? 0) + 1;
    }

    let zeroResultExplanation: string | undefined;
    if (final.length === 0) {
      if (aiResult.error) {
        zeroResultExplanation = `AI extraction failed: ${aiResult.error}`;
      } else if (aiResult.rawNames.length > 0 && aiResult.droppedCount >= aiResult.rawNames.length) {
        zeroResultExplanation =
          'AI returned names but all failed grounding (not found verbatim in extracted text).';
      } else if (fullText.trim().length < 100) {
        zeroResultExplanation = 'Page rendered very little visible text.';
      } else {
        zeroResultExplanation = 'No company names extracted. Try a more specific member/directory URL.';
      }
    }

    const locateReason = locate.error
      ? `locate error: ${locate.error}; `
      : `pass1 ${locate.rosterUrls.length} urls + ${locate.textSpans.length} spans; `;
    const pass2Reason = aiResult.error
      ? `pass2 error: ${aiResult.error}`
      : `pass2 ${aiResult.rawNames.length} raw → ${aiResult.candidates.length} grounded; ${aiResult.chunksProcessed ?? 0} chunks`;

    return {
      candidates: final,
      debug: {
        sourceUrl,
        finalUrl,
        pageTitle: title,
        zeroResultExplanation,
        topContainers: topContainers.slice(0, 8).map(mapContainer),
        strategyCounts,
        aiFallbackUsed: true,
        aiFallbackReason: `${locateReason}${pass2Reason} (${aiResult.modelUsed})`,
        iframeCount: bundle.iframeCount,
        loadMoreClicks: bundle.loadMoreClicks,
        aiLocateSummary: {
          rosterUrlsFound: locate.rosterUrls.length,
          textSpansFound: locate.textSpans.length,
          extraPagesFetched,
          extractChunks: aiResult.chunksProcessed ?? 0,
        },
      },
    };
  }

  const { candidates: detCandidates, strategyCounts } = runDeterministicPipeline(
    html,
    [],
    fragments,
    finalUrl,
    fullText,
    maxCompanies,
  );

  const merged = dedupeCompanyCandidates([...structuredCandidates, ...detCandidates]);
  const final = maxCompanies ? merged.slice(0, maxCompanies) : merged;

  let zeroResultExplanation: string | undefined;
  if (final.length === 0) {
    if (fullText.trim().length < 80) {
      zeroResultExplanation = 'Page had very little visible text.';
    } else if (!topContainers.length || topContainers[0].score < 15) {
      zeroResultExplanation =
        'No high-scoring roster container. Enable AI extraction (OPENROUTER_API_KEY) for prose member lists.';
    } else {
      zeroResultExplanation =
        'Deterministic extraction found no grounded names. Enable AI extraction for complex pages.';
    }
  }

  return {
    candidates: final,
    debug: {
      sourceUrl,
      finalUrl,
      pageTitle: title,
      zeroResultExplanation,
      topContainers: topContainers.slice(0, 8).map(mapContainer),
      strategyCounts,
      aiFallbackUsed: false,
      aiFallbackReason: 'AI disabled or OPENROUTER_API_KEY not set',
      iframeCount: bundle.iframeCount,
      loadMoreClicks: bundle.loadMoreClicks,
    },
  };
}

export async function extractCompanyNamesFromPage(
  page: Page,
  options: ExtractCompanyNamesOptions,
): Promise<ExtractCompanyNamesResult> {
  const { sourceUrl, cancelled } = options;

  const artifacts = await collectRenderedPageArtifacts(page, sourceUrl, { cancelled });
  if (cancelled && (await Promise.resolve(cancelled()))) {
    return makeEmptyResult(
      sourceUrl,
      artifacts.finalUrl,
      artifacts.title,
      'Cancelled during page load',
      artifacts.frames.length,
      artifacts.loadMoreClicks,
    );
  }

  const bundle: PageArtifactBundle = {
    sourceUrl,
    finalUrl: artifacts.finalUrl,
    title: artifacts.title,
    html: artifacts.html,
    fullText: mergePageText(artifacts),
    iframeCount: artifacts.frames.length,
    loadMoreClicks: artifacts.loadMoreClicks,
  };

  return runExtractionFromArtifactBundle(bundle, {
    ...options,
    fetchFollowUpUrl: async (url) => {
      const snap = await collectInnerTextForUrl(page, url, { cancelled });
      if (!snap || snap.text.trim().length < 50) return null;
      return { text: snap.text, finalUrl: snap.finalUrl };
    },
  });
}

/**
 * Playwright: load multiple listing pages by setting one query parameter (`page=1` … `page=N`).
 * Merges and dedupes candidates across the page range.
 */
export async function extractCompanyNamesFromPaginatedQueryPlaywright(
  page: Page,
  options: ExtractCompanyNamesOptions & {
    paginationQuery: { param: string; from: number; to: number };
  },
): Promise<ExtractCompanyNamesResult> {
  const { paginationQuery, sourceUrl: baseUrl, maxCompanies, cancelled, onLog, enableAiFallback } = options;
  const { param, from, to } = paginationQuery;

  let mergedCandidates: ExtractedCompanyCandidate[] = [];
  let mergedStrategyCounts: Partial<Record<NameExtractionMethod, number>> = {};
  let anyAiFallback = false;
  let lastDebug: NameExtractionDebugSummary | null = null;
  let pagesLoaded = 0;
  const claimedPages = new Set<number>();
  const completedPages = new Set<number>();
  const context = page.context();
  const concurrency = Math.min(getPaginationConcurrency(), to - from + 1);
  const baseDelayMs = getPaginationPageDelayMs();
  const challengeDelayMs = getPaginationChallengeDelayMs();
  const antiBotCooldownMs = getPaginationAntiBotCooldownMs();
  const antiBotRetryLimit = getPaginationAntiBotRetryLimit();
  const workers = [page];
  for (let i = 1; i < concurrency; i += 1) {
    workers.push(await context.newPage());
  }

  try {
    let nextPage = from;
    let challengeMode = false;
    let globalCooldownUntil = 0;
    const runWorker = async (workerPage: Page) => {
      for (;;) {
        if (cancelled && (await Promise.resolve(cancelled()))) return;
        const now = Date.now();
        if (globalCooldownUntil > now) {
          await sleep(globalCooldownUntil - now);
          continue;
        }
        const currentPage = nextPage;
        nextPage += 1;
        if (currentPage > to) return;
        if (claimedPages.has(currentPage)) {
          if (onLog) {
            await Promise.resolve(onLog(`Skipped duplicate pagination claim for ${param}=${currentPage}`));
          }
          continue;
        }
        claimedPages.add(currentPage);

        const pageUrl = setUrlSearchParam(baseUrl, param, String(currentPage));
        if (onLog) {
          await Promise.resolve(onLog(`Pagination: ${param}=${currentPage} (${currentPage - from + 1}/${to - from + 1})`));
        }

        let result: ExtractCompanyNamesResult | null = null;
        let antiBotAttempts = 0;
        for (;;) {
          result =
            enableAiFallback ?
              await extractCompaniesFromSinglePageRosterWithAi(workerPage, {
                sourceUrl: pageUrl,
                cancelled,
                onLog,
                skipHttpProbe: challengeMode && antiBotAttempts > 0,
              })
            : await extractCompanyNamesFromPage(workerPage, {
                sourceUrl: pageUrl,
                maxCompanies: undefined,
                enableAiFallback: false,
                cancelled,
                onLog,
              });

          const diagnosisKind = result.debug.pageDiagnosis?.kind;
          if (diagnosisKind !== 'anti-bot-or-rate-limit' || antiBotAttempts >= antiBotRetryLimit) {
            break;
          }

          antiBotAttempts += 1;
          challengeMode = true;
          globalCooldownUntil = Math.max(globalCooldownUntil, Date.now() + antiBotCooldownMs);
          if (onLog) {
            await Promise.resolve(
              onLog(
                `Challenge detected on ${pageUrl}; backing off for ${(antiBotCooldownMs / 1000).toFixed(0)}s before retry ${antiBotAttempts}/${antiBotRetryLimit}.`,
              ),
            );
          }
          await sleep(antiBotCooldownMs);
        }
        if (!result) return;

        if (result.debug.pageDiagnosis?.kind === 'anti-bot-or-rate-limit') {
          challengeMode = true;
          globalCooldownUntil = Math.max(globalCooldownUntil, Date.now() + antiBotCooldownMs);
        }

        mergedCandidates = dedupeCompanyCandidates([...mergedCandidates, ...result.candidates]);
        mergedStrategyCounts = mergeStrategyCounts(mergedStrategyCounts, result.debug.strategyCounts);
        anyAiFallback = anyAiFallback || result.debug.aiFallbackUsed;
        lastDebug = result.debug;
        pagesLoaded += 1;
        completedPages.add(currentPage);

        if (maxCompanies && mergedCandidates.length >= maxCompanies) {
          return;
        }

        const interPageDelayMs = challengeMode ? challengeDelayMs : baseDelayMs;
        if (currentPage < to && interPageDelayMs > 0) {
          await sleep(interPageDelayMs);
        }
      }
    };

    await Promise.all(workers.map((workerPage) => runWorker(workerPage)));
  } finally {
    for (const workerPage of workers.slice(1)) {
      await workerPage.close().catch(() => {});
    }
  }

  let finalCandidates = mergedCandidates;
  if (maxCompanies && finalCandidates.length > maxCompanies) {
    finalCandidates = finalCandidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCompanies);
  }

  const baseDebug: NameExtractionDebugSummary =
    lastDebug ??
    ({
      sourceUrl: baseUrl,
      finalUrl: baseUrl,
      pageTitle: '',
      zeroResultExplanation: 'No listing pages were processed.',
      topContainers: [],
      strategyCounts: {},
      aiFallbackUsed: false,
      iframeCount: 0,
      loadMoreClicks: 0,
    } satisfies NameExtractionDebugSummary);

  return {
    candidates: finalCandidates,
    debug: {
      ...baseDebug,
      sourceUrl: baseUrl,
      finalUrl: baseDebug.finalUrl || baseUrl,
      strategyCounts: mergedStrategyCounts,
      aiFallbackUsed: anyAiFallback,
      paginationQuery: { param, from, to, pagesLoaded },
      aiFallbackReason:
        baseDebug.aiFallbackReason ??
        `pagination claimed ${claimedPages.size} page(s), completed ${completedPages.size} page(s)`,
      zeroResultExplanation:
        finalCandidates.length === 0
          ? baseDebug.zeroResultExplanation ?? 'No companies extracted across paginated listing pages.'
          : undefined,
    },
  };
}

async function extractCompaniesFromSinglePageRosterWithAi(
  page: Page,
  options: {
    sourceUrl: string;
    cancelled?: CancelSignal;
    onLog?: (message: string) => void | Promise<void>;
    skipHttpProbe?: boolean;
  },
): Promise<ExtractCompanyNamesResult> {
  const { sourceUrl, cancelled, onLog, skipHttpProbe } = options;
  const artifacts = await collectRenderedPageArtifacts(page, sourceUrl, { cancelled });
  if (cancelled && (await Promise.resolve(cancelled()))) {
    return makeEmptyResult(
      sourceUrl,
      artifacts.finalUrl,
      artifacts.title,
      'Cancelled during page load',
      artifacts.frames.length,
      artifacts.loadMoreClicks,
    );
  }

  const fullText = mergePageText(artifacts);
  const links = collectPageLinks(artifacts.html, artifacts.finalUrl);

  if (isSpecialtyFoodDirectoryUrl(artifacts.finalUrl)) {
    const fastPath = extractSpecialtyFoodDirectoryCandidates(artifacts.html, artifacts.finalUrl);
    if (fastPath.length > 0) {
      if (onLog) {
        await Promise.resolve(
          onLog(
            `Fast path roster extraction: ${fastPath.length} companies from Specialty Food DOM on ${artifacts.finalUrl}`,
          ),
        );
      }
      return {
        candidates: fastPath,
        debug: {
          sourceUrl,
          finalUrl: artifacts.finalUrl,
          pageTitle: artifacts.title,
          zeroResultExplanation: undefined,
          topContainers: [],
          strategyCounts: { 'detail-link': fastPath.length },
          aiFallbackUsed: false,
          aiFallbackReason: 'specialtyfood-fast-path',
          iframeCount: artifacts.frames.length,
          loadMoreClicks: artifacts.loadMoreClicks,
          aiLocateSummary: {
            rosterUrlsFound: fastPath.length,
            textSpansFound: fullText.length,
            extraPagesFetched: 0,
            extractChunks: 0,
          },
        },
      };
    }

    if (fullText.trim().length === 0 && links.length === 0) {
      const diagnosis = await diagnoseSpecialtyFoodEmptyPage({
        pageUrl: sourceUrl,
        finalUrl: artifacts.finalUrl,
        pageTitle: artifacts.title,
        playwrightText: fullText,
        playwrightLinkCount: links.length,
        skipHttpProbe,
      });

      if (diagnosis.kind === 'client-side-render-failure' && diagnosis.fallbackHtml) {
        const recovered = extractSpecialtyFoodDirectoryCandidates(
          diagnosis.fallbackHtml,
          artifacts.finalUrl || sourceUrl,
        );
        if (recovered.length > 0) {
          if (onLog) {
            await Promise.resolve(
              onLog(
                `HTTP fallback roster extraction: ${recovered.length} companies recovered from direct HTML on ${sourceUrl} (${diagnosis.detail})`,
              ),
            );
          }
          return {
            candidates: recovered,
            debug: {
              sourceUrl,
              finalUrl: artifacts.finalUrl,
              pageTitle: artifacts.title,
              zeroResultExplanation: undefined,
              pageDiagnosis: {
                kind: diagnosis.kind,
                detail: diagnosis.detail,
                playwrightTextLength: fullText.length,
                playwrightLinkCount: links.length,
                httpStatus: diagnosis.httpStatus,
                httpItemCount: diagnosis.httpItemCount,
              },
              topContainers: [],
              strategyCounts: { 'detail-link': recovered.length },
              aiFallbackUsed: false,
              aiFallbackReason: 'specialtyfood-http-fallback-after-empty-playwright',
              iframeCount: artifacts.frames.length,
              loadMoreClicks: artifacts.loadMoreClicks,
              aiLocateSummary: {
                rosterUrlsFound: recovered.length,
                textSpansFound: 0,
                extraPagesFetched: 0,
                extractChunks: 0,
              },
            },
          };
        }
      }

      if (onLog) {
        await Promise.resolve(
          onLog(
            `Specialty Food empty-page diagnosis: ${diagnosis.kind} on ${sourceUrl} (${diagnosis.detail})`,
          ),
        );
      }

      return {
        candidates: [],
        debug: {
          sourceUrl,
          finalUrl: artifacts.finalUrl,
          pageTitle: artifacts.title,
          zeroResultExplanation: diagnosis.detail,
          pageDiagnosis: {
            kind: diagnosis.kind,
            detail: diagnosis.detail,
            playwrightTextLength: fullText.length,
            playwrightLinkCount: links.length,
            httpStatus: diagnosis.httpStatus,
            httpItemCount: diagnosis.httpItemCount,
          },
          topContainers: [],
          strategyCounts: {},
          aiFallbackUsed: false,
          aiFallbackReason: 'specialtyfood-empty-page-diagnosed-before-ai',
          iframeCount: artifacts.frames.length,
          loadMoreClicks: artifacts.loadMoreClicks,
          aiLocateSummary: {
            rosterUrlsFound: 0,
            textSpansFound: 0,
            extraPagesFetched: 0,
            extractChunks: 0,
          },
        },
      };
    }
  }

  if (onLog) {
    await Promise.resolve(
      onLog(
        `AI page roster extraction: ${fullText.length.toLocaleString()} chars, ${links.length} links from ${artifacts.finalUrl}`,
      ),
    );
  }

  const ai = await extractPageRosterWithAi({
    pageUrl: artifacts.finalUrl,
    pageTitle: artifacts.title,
    visibleText: fullText,
    links,
  });

  if (ai.error && onLog) {
    await Promise.resolve(onLog(`AI page roster warning: ${ai.error}`));
  }

  const strategyCounts: Partial<Record<NameExtractionMethod, number>> = ai.candidates.length
    ? { 'ai-classified': ai.candidates.length }
    : {};

  if (onLog) {
    await Promise.resolve(
      onLog(
        `AI page roster result: ${ai.candidates.length} companies, ${ai.candidates.filter((c) => Boolean(c.listingUrl || c.detailUrl)).length} member/profile URL(s) captured`,
      ),
    );
  }

  return {
    candidates: ai.candidates,
    debug: {
      sourceUrl,
      finalUrl: artifacts.finalUrl,
      pageTitle: artifacts.title,
      zeroResultExplanation:
        ai.candidates.length === 0
          ? ai.error ?? 'AI page roster extraction returned no grounded companies.'
          : undefined,
      topContainers: [],
      strategyCounts,
      aiFallbackUsed: true,
      aiFallbackReason: `ai-page-roster; model:${ai.modelUsed}; raw:${ai.rawCount ?? 0}; links:${links.length}`,
      iframeCount: artifacts.frames.length,
      loadMoreClicks: artifacts.loadMoreClicks,
      aiLocateSummary: {
        rosterUrlsFound: 0,
        textSpansFound: fullText.length,
        extraPagesFetched: 0,
        extractChunks: 1,
      },
    },
  };
}

/** Firecrawl scrape result → same extraction as Playwright (follow-ups via Firecrawl). */
export async function extractCompanyNamesFromFirecrawl(
  fc: FirecrawlScrapeSuccess,
  sourceUrl: string,
  options: ExtractCompanyNamesOptions,
): Promise<ExtractCompanyNamesResult> {
  const $ = cheerio.load(fc.html || '<html></html>');
  const plain = ($('body').text() || '').replace(/\s+/g, ' ').trim();
  const fullText = [fc.markdown, plain].filter(Boolean).join('\n\n').trim() || fc.textForAi;

  const bundle: PageArtifactBundle = {
    sourceUrl,
    finalUrl: fc.finalUrl,
    title: fc.title,
    html: fc.html,
    fullText,
    iframeCount: 0,
    loadMoreClicks: 0,
    prefetchedLinks: fc.links,
  };

  return runExtractionFromArtifactBundle(bundle, {
    ...options,
    fetchFollowUpUrl: async (url) => {
      const r = await firecrawlScrape(url);
      if (!r.ok || !r.textForAi.trim() || r.textForAi.trim().length < 50) return null;
      return { text: r.textForAi, finalUrl: r.finalUrl };
    },
  });
}

export function extractCompanyNamesFromHtml(
  html: string,
  sourceUrl: string,
  options?: { maxCompanies?: number; enableAiFallback?: boolean },
): ExtractCompanyNamesResult {
  const maxCompanies = options?.maxCompanies;
  const $ = cheerio.load(html);
  const fullText = $('body').text().replace(/\s+/g, ' ');
  const topContainers = discoverCandidateContainers(html, sourceUrl).slice(0, 15);
  const fragments = getTopContainerHtmlFragments(html, 12);

  const structuredCandidates = [
    ...extractFromJsonLd(html, sourceUrl),
    ...extractFromMicrodata(html, sourceUrl),
  ].filter((c) => isGroundedInPageText(c.name, fullText));

  const { candidates: detCandidates, strategyCounts } = runDeterministicPipeline(
    html,
    [],
    fragments,
    sourceUrl,
    fullText,
    maxCompanies,
  );

  const merged = dedupeCompanyCandidates([...structuredCandidates, ...detCandidates]);
  const final = maxCompanies ? merged.slice(0, maxCompanies) : merged;

  let zeroResultExplanation: string | undefined;
  if (final.length === 0) {
    if (fullText.length < 80) zeroResultExplanation = 'Page had very little visible text.';
    else if (!topContainers.length || topContainers[0].score < 15)
      zeroResultExplanation = 'No high-scoring roster container; enable AI for complex layouts.';
    else zeroResultExplanation = 'No grounded organization-like names passed deterministic filters.';
  }

  return {
    candidates: final,
    debug: {
      sourceUrl,
      finalUrl: sourceUrl,
      zeroResultExplanation,
      topContainers: topContainers.slice(0, 8).map((c) => ({
        selectorPath: c.selectorPath,
        tagName: c.tagName,
        classIdSummary: c.classIdSummary,
        textLength: c.textLength,
        linkCount: c.linkCount,
        repeatedChildSummary: c.repeatedChildSummary,
        keywordHits: c.keywordHits,
        score: c.score,
        scoreReasons: c.scoreReasons,
      })),
      strategyCounts,
      aiFallbackUsed: false,
      iframeCount: 0,
      loadMoreClicks: 0,
    },
  };
}
