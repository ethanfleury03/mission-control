import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { ROSTER_KEYWORDS } from './name-extraction-constants';

export interface CandidateContainer {
  selectorPath: string;
  tagName: string;
  classIdSummary: string;
  textLength: number;
  linkCount: number;
  repeatedChildSummary: string;
  keywordHits: string[];
  score: number;
  scoreReasons: string[];
  /** Short plain-text preview for AI / debug */
  textPreview: string;
  /** Cheerio element reference for downstream extraction (not serialized) */
  _ref?: unknown;
}

const BAD_ANCESTOR = /nav|header|footer|aside|breadcrumb|modal|cookie|consent|pagination(\s|$)|search-form|filters?|sort-/i;

function buildSelectorPath($: cheerio.CheerioAPI, el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 6) {
    const tag = cur.tagName?.toLowerCase() ?? 'div';
    let part = tag;
    if (cur.attribs?.id) {
      part += `#${cur.attribs.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      parts.unshift(part);
      break;
    }
    if (cur.attribs?.class) {
      const c = cur.attribs.class.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (c) part += `.${c}`;
    }
    parts.unshift(part);
    cur = cur.parent?.type === 'tag' ? (cur.parent as Element) : null;
    depth++;
  }
  return parts.join(' > ');
}

function classIdSummary(el: Element): string {
  const id = el.attribs?.id ? `#${el.attribs.id}` : '';
  const cls =
    el.attribs?.class
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join('.') ?? '';
  return `${id}${cls ? '.' + cls : ''}`.slice(0, 120);
}

function isBadRegion($: cheerio.CheerioAPI, el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    const tag = cur.tagName?.toLowerCase() ?? '';
    if (['nav', 'header', 'footer', 'aside'].includes(tag)) return true;
    const role = (cur.attribs?.role ?? '').toLowerCase();
    if (role === 'navigation' || role === 'banner' || role === 'contentinfo') return true;
    const cls = (cur.attribs?.class ?? '') + ' ' + (cur.attribs?.id ?? '');
    if (BAD_ANCESTOR.test(cls)) return true;
    cur = cur.parent?.type === 'tag' ? (cur.parent as Element) : null;
  }
  return false;
}

function repeatedChildSignature($: cheerio.CheerioAPI, container: Element): string {
  const $c = $(container);
  const children = $c.children().toArray();
  if (children.length < 2) return 'flat';
  const sigs: string[] = [];
  for (let i = 0; i < Math.min(8, children.length); i++) {
    const ch = children[i];
    const tag = ch.tagName?.toLowerCase() ?? 'x';
    const n = $(ch).children().length;
    sigs.push(`${tag}:${n}`);
  }
  const counts = new Map<string, number>();
  for (const s of sigs) counts.set(s, (counts.get(s) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]}×${top[1]}` : 'mixed';
}

function countKeywordHits(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const kw of ROSTER_KEYWORDS) {
    if (lower.includes(kw)) hits.push(kw);
  }
  return hits;
}

function scoreSemanticBoost(tag: string, clsId: string): number {
  let s = 0;
  const blob = `${tag} ${clsId}`.toLowerCase();
  if (['main', 'article', 'section'].includes(tag)) s += 8;
  if (/content|body|main|list|directory|member|partner|exhibitor|roster/.test(blob)) s += 10;
  return s;
}

export function discoverCandidateContainers(html: string, baseUrl: string): CandidateContainer[] {
  const $ = cheerio.load(html);
  const candidates: CandidateContainer[] = [];

  const selectors = [
    'main',
    'article',
    'section',
    '[role="main"]',
    'div[class*="content"]',
    'div[class*="main"]',
    'div[class*="directory"]',
    'div[class*="member"]',
    'div[class*="listing"]',
    'div[class*="container"]',
    'body',
  ];

  const seen = new Set<string>();

  for (const sel of selectors) {
    $(sel).each((_, el: AnyNode) => {
      if (el.type !== 'tag') return;
      if (isBadRegion($, el)) return;
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length < 80) return;
      const path = buildSelectorPath($, el);
      if (seen.has(path)) return;
      seen.add(path);

      const links = $(el).find('a[href]');
      const linkCount = links.length;
      const keywordHits = countKeywordHits(text.slice(0, 8000));
      const rep = repeatedChildSignature($, el);
      const clsId = classIdSummary(el);

      let score = 0;
      const reasons: string[] = [];

      score += Math.min(25, Math.floor(text.length / 400));
      reasons.push(`text~${text.length}`);

      score += Math.min(30, linkCount);
      reasons.push(`links=${linkCount}`);

      if (keywordHits.length) {
        score += keywordHits.length * 6;
        reasons.push(`keywords:${keywordHits.slice(0, 4).join(',')}`);
      }

      if (rep.includes('×') && !rep.startsWith('flat')) {
        score += 15;
        reasons.push(`repeat:${rep}`);
      }

      score += scoreSemanticBoost(el.tagName?.toLowerCase() ?? 'div', clsId);

      candidates.push({
        selectorPath: path,
        tagName: el.tagName?.toLowerCase() ?? 'div',
        classIdSummary: clsId,
        textLength: text.length,
        linkCount,
        repeatedChildSummary: rep,
        keywordHits,
        score,
        scoreReasons: reasons,
        textPreview: text.slice(0, 500),
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 40);
}

/** Top N container subtrees as HTML strings for targeted extraction. */
export function getTopContainerHtmlFragments(html: string, limit: number): Array<{ html: string; meta: CandidateContainer }> {
  const ranked = discoverCandidateContainers(html, '');
  const $ = cheerio.load(html);
  const out: Array<{ html: string; meta: CandidateContainer }> = [];
  const seen = new Set<string>();

  const tryPush = (meta: CandidateContainer, el: Element): boolean => {
    const frag = $.html(el);
    if (frag.length < 100 || frag.length > 800_000) return false;
    const h = frag.slice(0, 200);
    if (seen.has(h)) return false;
    seen.add(h);
    out.push({ html: frag, meta });
    return out.length >= limit;
  };

  for (const meta of ranked) {
    if (out.length >= limit) break;
    try {
      const el = $(meta.selectorPath).first()[0];
      if (el && el.type === 'tag') {
        if (tryPush(meta, el as Element)) break;
      }
    } catch {
      /* invalid selector */
    }
  }

  if (out.length === 0) {
    const body = $('body')[0];
    if (body && body.type === 'tag') {
      const meta: CandidateContainer = {
        selectorPath: 'body',
        tagName: 'body',
        classIdSummary: '',
        textLength: $('body').text().length,
        linkCount: $('body').find('a').length,
        repeatedChildSummary: 'fallback',
        keywordHits: [],
        score: 1,
        scoreReasons: ['body-fallback'],
        textPreview: $('body').text().replace(/\s+/g, ' ').trim().slice(0, 500),
      };
      tryPush(meta, body as Element);
    }
  }

  return out;
}
