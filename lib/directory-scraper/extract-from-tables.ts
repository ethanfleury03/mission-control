import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate } from './types';
import { TABLE_HEADER_HINTS } from './name-extraction-constants';
import { normalizeUrl } from './utils';
import { normalizeForCompareKey } from './dedupe-company-candidates';

function headerScore(text: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const h of TABLE_HEADER_HINTS) {
    if (lower.includes(h)) s += 3;
  }
  return s;
}

/** `fragmentHtml` may be full document or a container subtree. */
export function extractFromTables(fragmentHtml: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(fragmentHtml);
  const candidates: ExtractedCompanyCandidate[] = [];

  $('table').each((_, table) => {
    const $t = $(table);
    const rows = $t.find('tr');
    if (rows.length < 2) return;

    const headerRow = $t.find('thead tr').first().length ? $t.find('thead tr').first() : rows.first();
    const ths = headerRow.find('th, td');
    let nameCol = -1;
    let bestHs = 0;

    if (ths.length > 0) {
      ths.each((i, cell) => {
        const hs = headerScore($(cell).text());
        if (hs > bestHs) {
          bestHs = hs;
          nameCol = i;
        }
      });
    }

    if (nameCol < 0) {
      const firstBodyRow = $t.find('tbody tr').first().length ? $t.find('tbody tr').first() : rows.eq(1);
      const cells = firstBodyRow.find('td, th');
      let bestLen = 0;
      cells.each((i, cell) => {
        const txt = $(cell).text().trim();
        const len = txt.length;
        if (len > bestLen && len < 120 && len > 2) {
          bestLen = len;
          nameCol = i;
        }
      });
    }

    if (nameCol < 0) return;

    const dataRows = $t.find('tbody tr').length ? $t.find('tbody tr') : rows.slice(1);
    dataRows.each((_, tr) => {
      const cells = $(tr).find('td, th');
      const cell = cells.eq(nameCol);
      const link = cell.find('a[href]').first();
      const text = (link.length ? link.text() : cell.text()).replace(/\s+/g, ' ').trim();
      if (text.length < 2 || text.length > 200) return;
      const href = link.attr('href');
      const listingUrl = href ? normalizeUrl(href, sourceUrl) : undefined;
      candidates.push({
        name: text,
        normalizedName: normalizeForCompareKey(text),
        sourceUrl,
        method: 'table',
        confidence: 70 + Math.min(10, bestHs),
        reasons: [`table col ${nameCol}`, `headerScore=${bestHs}`],
        sourceText: text,
        listingUrl,
        detailUrl: listingUrl,
      });
    });
  });

  return candidates;
}
