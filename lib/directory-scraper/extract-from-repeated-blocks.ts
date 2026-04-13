import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { ExtractedCompanyCandidate } from './types';
import { normalizeUrl } from './utils';
import { normalizeForCompareKey } from './dedupe-company-candidates';

function pickDisplayText($: cheerio.CheerioAPI, block: Element): { text: string; selectorHint: string } {
  const $b = $(block);
  const a = $b.find('a[href]').first();
  if (a.length) {
    const t = a.text().replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && t.length < 200) return { text: t, selectorHint: 'a' };
  }
  const strong = $b.find('strong, b').first();
  if (strong.length) {
    const t = strong.text().replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && t.length < 200) return { text: t, selectorHint: 'strong' };
  }
  const h = $b.find('h1,h2,h3,h4,h5,h6').first();
  if (h.length) {
    const t = h.text().replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && t.length < 200) return { text: t, selectorHint: 'heading' };
  }
  const t = $b.text().replace(/\s+/g, ' ').trim().split(/[\n\r]/)[0]?.trim() ?? '';
  if (t.length > 200) return { text: t.slice(0, 200).trim(), selectorHint: 'text' };
  return { text: t, selectorHint: 'text' };
}

function childSignature($: cheerio.CheerioAPI, el: Element): string {
  const tag = el.tagName?.toLowerCase() ?? 'x';
  const n = $(el).children().length;
  const na = $(el).find('a[href]').length;
  return `${tag}:c${n}:a${na}`;
}

export function extractFromRepeatedBlocks(fragmentHtml: string, sourceUrl: string, containerMeta?: { selectorPath: string; score: number }): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(fragmentHtml);
  let root: Element | null = null;
  const body0 = $('body')[0];
  if (body0?.type === 'tag') root = body0 as Element;
  if (!root) {
    const kids = $.root().children().toArray();
    root = (kids.find((k) => k.type === 'tag') as Element | undefined) ?? null;
  }

  if (!root || root.type !== 'tag') return [];

  const groups = new Map<string, Element[]>();
  const direct = $(root).children().toArray().filter((c) => c.type === 'tag') as Element[];

  for (const ch of direct) {
    const sig = childSignature($, ch);
    const arr = groups.get(sig) ?? [];
    arr.push(ch);
    groups.set(sig, arr);
  }

  const out: ExtractedCompanyCandidate[] = [];

  for (const [, blocks] of groups) {
    if (blocks.length < 3) continue;
    for (const block of blocks) {
      const { text, selectorHint } = pickDisplayText($, block);
      if (text.length < 2 || text.length > 200) continue;
      const link = $(block).find('a[href]').first();
      const href = link.attr('href');
      const listingUrl = href ? normalizeUrl(href, sourceUrl) : undefined;
      out.push({
        name: text,
        normalizedName: normalizeForCompareKey(text),
        sourceUrl,
        method: 'repeated-block',
        confidence: 58 + Math.min(10, blocks.length),
        reasons: [`repeated ${blocks.length}× ${childSignature($, block)}`, `pick:${selectorHint}`],
        sourceText: text,
        listingUrl,
        detailUrl: listingUrl,
        containerSelector: containerMeta?.selectorPath,
        containerScore: containerMeta?.score,
      });
    }
  }

  $('li').each((_, li) => {
    const parent = $(li).parent()[0];
    if (!parent) return;
    const lis = $(parent).children('li').length;
    if (lis < 4) return;
    const { text, selectorHint } = pickDisplayText($, li as Element);
    if (text.length < 2 || text.length > 180) return;
    const link = $(li).find('a[href]').first();
    const href = link.attr('href');
    const listingUrl = href ? normalizeUrl(href, sourceUrl) : undefined;
    out.push({
      name: text,
      normalizedName: normalizeForCompareKey(text),
      sourceUrl,
      method: 'repeated-block',
      confidence: 56,
      reasons: [`list li (${lis} items)`, selectorHint],
      sourceText: text,
      listingUrl,
      detailUrl: listingUrl,
      containerSelector: containerMeta?.selectorPath,
      containerScore: containerMeta?.score,
    });
  });

  return out;
}
