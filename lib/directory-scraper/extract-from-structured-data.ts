import * as cheerio from 'cheerio';
import type { ExtractedCompanyCandidate, NameExtractionMethod } from './types';
import { normalizeForCompareKey } from './dedupe-company-candidates';

function pushName(
  out: ExtractedCompanyCandidate[],
  name: string,
  sourceUrl: string,
  method: NameExtractionMethod,
  reasons: string[],
  extra?: Partial<ExtractedCompanyCandidate>,
) {
  const n = name.replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 200) return;
  out.push({
    name: n,
    normalizedName: normalizeForCompareKey(n),
    sourceUrl,
    method,
    confidence: method === 'jsonld' ? 88 : 82,
    reasons,
    ...extra,
  });
}

function typesOf(o: Record<string, unknown>): string[] {
  const t = o['@type'];
  if (Array.isArray(t)) return t.map(String);
  if (t != null) return [String(t)];
  return [];
}

function isOrgType(types: string[]): boolean {
  return types.some((x) =>
    /Organization|LocalBusiness|Corporation|ProfessionalService|GovernmentOrganization/i.test(x),
  );
}

function extractOrgNamesFromJson(obj: unknown, out: string[], depth: number): void {
  if (depth > 14 || obj === null || obj === undefined) return;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const o = obj as Record<string, unknown>;
    const types = typesOf(o);

    if (isOrgType(types) && typeof o.name === 'string') {
      const n = o.name.trim();
      if (n) out.push(n);
    }

    if (types.some((t) => /ItemList|CollectionPage/i.test(t)) && o.itemListElement) {
      extractOrgNamesFromJson(o.itemListElement, out, depth + 1);
    }

    if (typeof o.item === 'object' && o.item !== null) {
      extractOrgNamesFromJson(o.item, out, depth + 1);
    }

    for (const [k, v] of Object.entries(o)) {
      if (k === 'name' || k === '@context' || k === '@type') continue;
      extractOrgNamesFromJson(v, out, depth + 1);
    }
    return;
  }

  if (Array.isArray(obj)) {
    for (const x of obj) {
      if (typeof x === 'object' && x !== null && !Array.isArray(x)) {
        const it = x as Record<string, unknown>;
        if (typeof it.item === 'object' && it.item !== null) {
          extractOrgNamesFromJson(it.item, out, depth + 1);
        }
      }
      extractOrgNamesFromJson(x, out, depth + 1);
    }
  }
}

export function extractFromJsonLd(html: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(html);
  const out: ExtractedCompanyCandidate[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const data = JSON.parse(raw.trim());
      const names: string[] = [];
      extractOrgNamesFromJson(data, names, 0);
      const seen = new Set<string>();
      for (const n of names) {
        const key = n.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        pushName(out, n, sourceUrl, 'jsonld', ['json-ld Organization / ItemList'], {
          sourceText: n,
          sourceSelector: 'script[type="application/ld+json"]',
        });
      }
    } catch {
      /* invalid JSON */
    }
  });
  return out;
}

export function extractFromMicrodata(html: string, sourceUrl: string): ExtractedCompanyCandidate[] {
  const $ = cheerio.load(html);
  const out: ExtractedCompanyCandidate[] = [];
  $('[itemtype*="schema.org/Organization"], [itemtype*="schema.org/LocalBusiness"]').each((_, el) => {
    const n = $(el).find('[itemprop="name"]').first().text().trim();
    if (n)
      pushName(out, n, sourceUrl, 'microdata', ['itemtype Organization'], {
        sourceText: n,
      });
  });
  return out;
}
