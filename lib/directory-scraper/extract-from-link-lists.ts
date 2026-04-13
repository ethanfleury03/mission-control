import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate } from './types';
import { normalizeUrl } from './utils';
import { normalizeForCompareKey } from './dedupe-company-candidates';
import { MENU_JUNK } from './name-extraction-constants';

export function extractFromLinkLists(
  fragmentHtml: string,
  sourceUrl: string,
  containerMeta?: { selectorPath: string; score: number },
): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(fragmentHtml);
  const base = new URL(sourceUrl);
  const out: ExtractedCompanyCandidate[] = [];

  const scope = $('body').length ? $('body') : ($.root() as unknown as cheerio.Cheerio<never>);
  scope.find('a[href]').each((_, el) => {
    const $a = $(el);
    if ($a.closest('nav, header, footer, aside, [role="navigation"]').length) return;
    const href = $a.attr('href');
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    let abs: URL;
    try {
      abs = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (abs.origin !== base.origin) {
      /* external — still can be company site link */
    }
    const text = $a.text().replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 180) return;
    const lower = text.toLowerCase();
    if (MENU_JUNK.has(lower)) return;
    if (/^(click|here|more|link)$/i.test(text)) return;

    const listingUrl = normalizeUrl(href, sourceUrl);
    const internal = abs.origin === base.origin;
    if (internal && /^\/(about|contact|privacy|terms|login|register|search|cart)(\/|$)/i.test(abs.pathname)) return;

    const looksMemberPath =
      internal &&
      /member|company|partner|exhibitor|supplier|profile|directory|\/people\/|\/org\//i.test(abs.pathname + abs.search);

    const confidence = looksMemberPath ? 62 : internal ? 52 : 48;

    out.push({
      name: text,
      normalizedName: normalizeForCompareKey(text),
      sourceUrl,
      method: 'link-list',
      confidence,
      reasons: [
        internal ? 'same-origin link' : 'external link',
        looksMemberPath ? 'member-like path' : 'dense link',
      ],
      sourceText: text,
      listingUrl,
      detailUrl: listingUrl,
      companyWebsiteHint: !internal ? abs.origin : undefined,
      containerSelector: containerMeta?.selectorPath,
      containerScore: containerMeta?.score,
    });
  });

  return dedupeByHref(out);
}

function dedupeByHref(cands: ExtractedCompanyCandidate[]): ExtractedCompanyCandidate[] {
  const byUrl = new Map<string, ExtractedCompanyCandidate>();
  for (const c of cands) {
    const u = c.listingUrl ?? '';
    const prev = byUrl.get(u);
    if (!prev || (c.confidence > prev.confidence && u)) byUrl.set(u, c);
  }
  return [...byUrl.values()];
}
