import * as cheerio from 'cheerio';
import type { Page } from 'playwright';
import type { ExtractedCompanyCandidate, NameExtractionDebugSummary, NameExtractionMethod } from './types';
import { collectRenderedPageArtifacts } from './collect-rendered-page-artifacts';
import { discoverCandidateContainers, getTopContainerHtmlFragments } from './discover-candidate-containers';
import { extractFromJsonLd, extractFromMicrodata } from './extract-from-structured-data';
import { extractFromTables } from './extract-from-tables';
import { extractFromRepeatedBlocks } from './extract-from-repeated-blocks';
import { extractFromLinkLists } from './extract-from-link-lists';
import { extractFromPlainText } from './extract-from-plain-text';
import { extractFromDetailLinks } from './extract-from-detail-links';
import { dedupeCompanyCandidates } from './dedupe-company-candidates';
import { isGroundedInPageText } from './ground-company-name';
import { isLikelyOrganizationName, scoreCompanyCandidate } from './score-company-candidates';
import { chooseBestRosterContainersWithAi, containersToAiPayload } from './ai-container-selection';
import { classifyCompanyCandidatesWithAi } from './ai-candidate-classification';
import { MAX_EXTRACTION_CANDIDATES, MAX_CONTAINERS_FOR_AI, MAX_CANDIDATES_FOR_AI } from './name-extraction-constants';
import type { CancelSignal } from './extract-directory-entries';

function mergePageText(artifacts: { text: string; frames: { text: string }[] }): string {
  const parts = [artifacts.text, ...artifacts.frames.map((f) => f.text)];
  return parts.join('\n').replace(/\s+/g, ' ');
}

function strategyKey(m: NameExtractionMethod): NameExtractionMethod {
  return m;
}

function runFullDocumentStrategies(html: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const out: ExtractedCompanyCandidate[] = [];
  out.push(...extractFromJsonLd(html, sourceUrl));
  out.push(...extractFromMicrodata(html, sourceUrl));
  out.push(...extractFromTables(html, sourceUrl));
  out.push(...extractFromDetailLinks(html, sourceUrl));
  out.push(...extractFromRepeatedBlocks(html, sourceUrl));
  out.push(...extractFromLinkLists(html, sourceUrl));
  /* plain-text only inside scored containers — full-body prose is too noisy */
  return out;
}

function runContainerStrategies(
  html: string,
  sourceUrl: string,
  containerMeta: { selectorPath: string; score: number },
): ExtractedCompanyCandidate[] {
  const out: ExtractedCompanyCandidate[] = [];
  out.push(...extractFromTables(html, sourceUrl));
  out.push(...extractFromDetailLinks(html, sourceUrl, containerMeta));
  out.push(...extractFromRepeatedBlocks(html, sourceUrl, containerMeta));
  out.push(...extractFromLinkLists(html, sourceUrl, containerMeta));
  out.push(...extractFromPlainText(html, sourceUrl, containerMeta));
  return out;
}

export interface ExtractCompanyNamesOptions {
  sourceUrl: string;
  maxCompanies?: number;
  enableAiFallback?: boolean;
  cancelled?: CancelSignal;
}

export interface ExtractCompanyNamesResult {
  candidates: ExtractedCompanyCandidate[];
  debug: NameExtractionDebugSummary;
}

export async function extractCompanyNamesFromPage(
  page: Page,
  options: ExtractCompanyNamesOptions,
): Promise<ExtractCompanyNamesResult> {
  const { sourceUrl, maxCompanies, enableAiFallback } = options;
  const cancelled = options.cancelled;

  const artifacts = await collectRenderedPageArtifacts(page, sourceUrl, { cancelled });
  if (cancelled && (await Promise.resolve(cancelled()))) {
    return {
      candidates: [],
      debug: {
        sourceUrl,
        finalUrl: artifacts.finalUrl,
        pageTitle: artifacts.title,
        zeroResultExplanation: 'Cancelled during page load',
        topContainers: [],
        strategyCounts: {},
        aiFallbackUsed: false,
        iframeCount: artifacts.frames.length,
        loadMoreClicks: artifacts.loadMoreClicks,
      },
    };
  }

  const fullText = mergePageText(artifacts);
  let topContainers = discoverCandidateContainers(artifacts.html, artifacts.finalUrl).slice(0, 15);

  let aiFallbackUsed = false;
  let aiFallbackReason: string | undefined;

  let fragments = getTopContainerHtmlFragments(artifacts.html, 6);

  const tryAiContainers =
    enableAiFallback &&
    process.env.OPENAI_API_KEY &&
    topContainers.length > 0 &&
    topContainers[0].score < 35;

  if (tryAiContainers) {
    const payload = containersToAiPayload(topContainers.slice(0, MAX_CONTAINERS_FOR_AI));
    const ai = await chooseBestRosterContainersWithAi(payload);
    if (ai && ai.chosenIds.length > 0) {
      aiFallbackUsed = true;
      aiFallbackReason = `container AI: ${ai.reasonCodes.join(',')}`;
      const $ = cheerio.load(artifacts.html);
      const reordered: typeof fragments = [];
      for (const id of ai.chosenIds) {
        const meta = topContainers[id];
        if (!meta) continue;
        try {
          const el = $(meta.selectorPath).first()[0];
          if (el && el.type === 'tag') {
            reordered.push({ html: $.html(el), meta });
          }
        } catch {
          /* skip */
        }
      }
      for (const f of fragments) {
        if (reordered.length >= 8) break;
        if (!reordered.some((r) => r.html === f.html)) reordered.push(f);
      }
      fragments = reordered.length ? reordered : fragments;
    }
  }

  const all: ExtractedCompanyCandidate[] = [];

  all.push(...runFullDocumentStrategies(artifacts.html, artifacts.finalUrl));

  for (const fr of artifacts.frames) {
    all.push(...runFullDocumentStrategies(fr.html, fr.url || artifacts.finalUrl));
  }

  for (const { html, meta } of fragments) {
    all.push(
      ...runContainerStrategies(html, artifacts.finalUrl, {
        selectorPath: meta.selectorPath,
        score: meta.score,
      }),
    );
  }

  const strategyCounts: Partial<Record<NameExtractionMethod, number>> = {};
  for (const c of all) {
    const k = strategyKey(c.method);
    strategyCounts[k] = (strategyCounts[k] ?? 0) + 1;
  }

  const grounded: ExtractedCompanyCandidate[] = [];
  for (const c of all) {
    if (grounded.length >= MAX_EXTRACTION_CANDIDATES) break;
    const src = c.sourceText ?? c.name;
    const inPage = isGroundedInPageText(c.name, fullText) || isGroundedInPageText(c.name, src);
    if (!inPage) continue;

    const likely = isLikelyOrganizationName(c.name, {
      hasExternalLink: !!c.companyWebsiteHint || (!!c.detailUrl && c.detailUrl !== c.listingUrl),
    });
    if (!likely.ok && c.method !== 'jsonld' && c.method !== 'microdata' && c.method !== 'table') continue;

    const scored = scoreCompanyCandidate({ ...c, confidence: c.confidence + (likely.ok ? 5 : 0) }, fullText);
    grounded.push({
      ...c,
      confidence: scored.score,
      reasons: [...c.reasons, ...scored.reasons],
    });
  }

  let deduped = dedupeCompanyCandidates(grounded);

  const avgConfidence =
    deduped.length > 0 ? deduped.reduce((s, c) => s + c.confidence, 0) / deduped.length : 0;

  const shouldClassifyAi =
    enableAiFallback &&
    process.env.OPENAI_API_KEY &&
    deduped.length > 0 &&
    (deduped.length > 80 || avgConfidence < 52 || deduped.filter((c) => c.method === 'plain-text' || c.method === 'link-list').length > deduped.length * 0.5);

  if (shouldClassifyAi && deduped.length > 0) {
    const slice = deduped.slice(0, MAX_CANDIDATES_FOR_AI);
    const forAi = slice.map((c, i) => ({ id: i, text: c.name, method: c.method }));
    const cls = await classifyCompanyCandidatesWithAi(forAi);
    if (cls && Object.keys(cls.labels).length > 0) {
      aiFallbackUsed = true;
      aiFallbackReason = (aiFallbackReason ? aiFallbackReason + '; ' : '') + 'candidate classification AI';
      const next: ExtractedCompanyCandidate[] = [];
      for (let i = 0; i < slice.length; i++) {
        const c = slice[i];
        const lab = cls.labels[i] ?? 'uncertain';
        if (lab === 'not_company') continue;
        if (lab === 'uncertain') {
          next.push({
            ...c,
            method: 'ai-classified',
            confidence: c.confidence - 8,
            reasons: [...c.reasons, 'ai:uncertain→keep with review'],
          });
        } else if (lab === 'company') {
          next.push({
            ...c,
            confidence: c.confidence + 3,
            reasons: [...c.reasons, 'ai:company'],
          });
        }
      }
      const rest = deduped.slice(MAX_CANDIDATES_FOR_AI);
      deduped = dedupeCompanyCandidates([...next, ...rest]);
    }
  }

  if (maxCompanies && deduped.length > maxCompanies) {
    deduped = deduped
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxCompanies);
  } else {
    deduped.sort((a, b) => b.confidence - a.confidence);
  }

  let zeroResultExplanation: string | undefined;
  if (deduped.length === 0) {
    if (fullText.length < 80) {
      zeroResultExplanation = 'Page had very little visible text (may be script-only or blocked).';
    } else if (artifacts.frames.length > 0 && artifacts.text.length < 200) {
      zeroResultExplanation = 'Main frame had little content; iframes were scanned but no grounded company names passed filters.';
    } else if (!topContainers.length || topContainers[0].score < 15) {
      zeroResultExplanation = 'No high-scoring content region matched directory/member patterns; try a deeper member URL or enable AI fallback.';
    } else {
      zeroResultExplanation = 'Heuristics found no grounded organization-like names after filtering. Try AI fallback or a different listing URL.';
    }
  }

  const debug: NameExtractionDebugSummary = {
    sourceUrl,
    finalUrl: artifacts.finalUrl,
    pageTitle: artifacts.title,
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
    aiFallbackUsed,
    aiFallbackReason,
    iframeCount: artifacts.frames.length,
    loadMoreClicks: artifacts.loadMoreClicks,
  };

  return { candidates: deduped, debug };
}

/** Fixture / unit tests: same pipeline without Playwright (static HTML). */
export function extractCompanyNamesFromHtml(
  html: string,
  sourceUrl: string,
  options?: { maxCompanies?: number; enableAiFallback?: boolean },
): ExtractCompanyNamesResult {
  const enableAiFallback = options?.enableAiFallback ?? false;
  const maxCompanies = options?.maxCompanies;
  const $ = cheerio.load(html);
  const fullText = $('body').text().replace(/\s+/g, ' ');
  const topContainers = discoverCandidateContainers(html, sourceUrl).slice(0, 15);
  const fragments = getTopContainerHtmlFragments(html, 6);

  const all: ExtractedCompanyCandidate[] = [];
  all.push(...runFullDocumentStrategies(html, sourceUrl));
  for (const { html: frag, meta } of fragments) {
    all.push(
      ...runContainerStrategies(frag, sourceUrl, {
        selectorPath: meta.selectorPath,
        score: meta.score,
      }),
    );
  }

  const strategyCounts: Partial<Record<NameExtractionMethod, number>> = {};
  for (const c of all) {
    strategyCounts[c.method] = (strategyCounts[c.method] ?? 0) + 1;
  }

  const grounded: ExtractedCompanyCandidate[] = [];
  for (const c of all) {
    if (grounded.length >= MAX_EXTRACTION_CANDIDATES) break;
    const src = c.sourceText ?? c.name;
    const inPage = isGroundedInPageText(c.name, fullText) || isGroundedInPageText(c.name, src);
    if (!inPage) continue;
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

  let zeroResultExplanation: string | undefined;
  if (deduped.length === 0) {
    if (fullText.length < 80) zeroResultExplanation = 'Page had very little visible text.';
    else if (!topContainers.length || topContainers[0].score < 15)
      zeroResultExplanation = 'No high-scoring roster container; content may be unstructured.';
    else zeroResultExplanation = 'No grounded organization-like names passed filters.';
  }

  const debug: NameExtractionDebugSummary = {
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
  };

  void enableAiFallback;

  return { candidates: deduped, debug };
}
