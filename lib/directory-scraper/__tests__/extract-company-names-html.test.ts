import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractCompanyNamesFromHtml } from '../extract-company-names';
import { isGroundedInPageText } from '../ground-company-name';
import { dedupeCompanyCandidates, normalizeForCompareKey } from '../dedupe-company-candidates';
import type { ExtractedCompanyCandidate } from '../types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('extractCompanyNamesFromHtml fixtures', () => {
  it('extracts table member names', () => {
    const { candidates, debug } = extractCompanyNamesFromHtml(fx('table-members.html'), 'https://assoc.example.org/members');
    const names = candidates.map((c) => c.name).sort();
    expect(names).toContain('Acme Packaging Inc');
    expect(names).toContain('Globex LLC');
    expect(names).toContain('Initech Corp');
    expect(debug.strategyCounts.table).toBeGreaterThan(0);
  });

  it('extracts JSON-LD organizations', () => {
    const { candidates } = extractCompanyNamesFromHtml(fx('jsonld-orgs.html'), 'https://assoc.example.org/partners');
    const names = candidates.map((c) => c.name).sort();
    expect(names).toEqual(['Alpha Industries', 'Beta Manufacturing LLC'].sort());
  });

  it('extracts detail member links', () => {
    const { candidates } = extractCompanyNamesFromHtml(fx('detail-links.html'), 'https://assoc.example.org/dir');
    const names = candidates.map((c) => c.name).sort();
    expect(names).toContain('Acme Corporation');
    expect(names).toContain('Globex International');
  });

  it('extracts plain-text enumeration in scored container', () => {
    const { candidates } = extractCompanyNamesFromHtml(fx('plain-list.html'), 'https://assoc.example.org/suppliers');
    const names = candidates.map((c) => c.name);
    expect(names.some((n) => n.includes('Northwind'))).toBe(true);
    expect(names.some((n) => n.includes('Contoso'))).toBe(true);
  });

  it('repeated card grid yields names', () => {
    const { candidates } = extractCompanyNamesFromHtml(fx('repeated-cards.html'), 'https://assoc.example.org/list');
    const names = candidates.map((c) => c.name).sort();
    expect(names).toContain('Widget Works');
    expect(names).toContain('Sprocket Solutions');
    expect(names).toContain('Gear Group');
  });

  it('nav noise page yields no companies', () => {
    const { candidates, debug } = extractCompanyNamesFromHtml(fx('nav-noise.html'), 'https://assoc.example.org/');
    expect(candidates.length).toBe(0);
    expect(debug.zeroResultExplanation).toBeTruthy();
  });
});

describe('grounding and dedupe', () => {
  it('isGroundedInPageText accepts substring', () => {
    const page = 'Hello Acme Corp and friends';
    expect(isGroundedInPageText('Acme Corp', page)).toBe(true);
    expect(isGroundedInPageText('FakeCo', page)).toBe(false);
  });

  it('dedupe merges legal suffix variants', () => {
    const a: ExtractedCompanyCandidate = {
      name: 'Acme Inc',
      normalizedName: normalizeForCompareKey('Acme Inc'),
      sourceUrl: 'https://x.com',
      method: 'table',
      confidence: 70,
      reasons: [],
    };
    const b: ExtractedCompanyCandidate = {
      name: 'Acme LLC',
      normalizedName: normalizeForCompareKey('Acme LLC'),
      sourceUrl: 'https://x.com',
      method: 'link-list',
      confidence: 50,
      reasons: [],
    };
    const out = dedupeCompanyCandidates([a, b]);
    expect(out.length).toBe(1);
  });
});
