import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate } from './types';
import { normalizeUrl } from './utils';
import { normalizeForCompareKey } from './dedupe-company-candidates';
import { MENU_JUNK } from './name-extraction-constants';

const MEMBER_PATH = /member|company|partner|exhibitor|supplier|profile|\/people\/|\/org\/|\/directory\//i;

export function extractFromDetailLinks(fragmentHtml: string, sourceUrl: string, containerMeta?: { selectorPath: string; score: number }): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(fragmentHtml);
  let base: URL;
  try {
    base = new URL(sourceUrl);
  } catch {
    return [];
  }

  const out: ExtractedCompanyCandidate[] = [];
  const scope = $('body').length ? $('body') : ($.root() as unknown as cheerio.Cheerio<never>);
  scope.find('a[href]').each((_, el) => {
    const $a = $(el);
    if ($a.closest('nav, header, footer, aside').length) return;
    const href = $a.attr('href');
    if (!href || href.startsWith('#')) return;
    let abs: URL;
    try {
      abs = new URL(href, sourceUrl);
    } catch {
      return;
    }
    if (abs.origin !== base.origin) return;
    if (!MEMBER_PATH.test(abs.pathname + abs.search)) return;

    const text = $a.text().replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > 200) return;
    if (MENU_JUNK.has(text.toLowerCase())) return;

    const listingUrl = normalizeUrl(href, sourceUrl);
    out.push({
      name: text,
      normalizedName: normalizeForCompareKey(text),
      sourceUrl,
      method: 'detail-link',
      confidence: 68,
      reasons: ['internal detail/member URL pattern'],
      sourceText: text,
      listingUrl,
      detailUrl: listingUrl,
      containerSelector: containerMeta?.selectorPath,
      containerScore: containerMeta?.score,
    });
  });

  return out;
}
