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
  const fragments = getTopContainerHtmlFragments(html, 6);

  const structuredCandidates: ExtractedCompanyCandidate[] = [
    ...extractFromJsonLd(html, finalUrl),
    ...extractFromMicrodata(html, finalUrl),
  ].filter((c) => isGroundedInPageText(c.name, fullText));

  if (structuredCandidates.length >= 3) {
    let deduped = dedupeCompanyCandidates(structuredCandidates);
    if (maxCompanies) deduped = deduped.slice(0, maxCompanies);
    return {
      candidates: deduped,
      debug: {
        sourceUrl,
        finalUrl,
        pageTitle: title,
        topContainers: topContainers.slice(0, 8).map(mapContainer),
        strategyCounts: { jsonld: structuredCandidates.filter((c) => c.method === 'jsonld').length },
        aiFallbackUsed: false,
        iframeCount: bundle.iframeCount,
        loadMoreClicks: bundle.loadMoreClicks,
      },
    };
  }

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
  const fragments = getTopContainerHtmlFragments(html, 6);

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
