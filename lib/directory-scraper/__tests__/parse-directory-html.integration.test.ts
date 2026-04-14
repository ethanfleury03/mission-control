import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseDirectoryHtmlPages, findNextPageHref, extractCandidatesFromHtml } from '../parse-directory-html';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('parse-directory-html integration', () => {
  it('extracts companies from a flat directory page', () => {
    const html = readFileSync(path.join(fixturesDir, 'flat-directory.html'), 'utf-8');
    const entries = parseDirectoryHtmlPages([{ html, url: 'https://dir.example.org/list' }]);
    expect(entries.length).toBe(3);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(['Alpha Manufacturing', 'Beta Services LLC', 'Gamma Corp']);
    expect(entries.every((e) => e.url.startsWith('http'))).toBe(true);
  });

  it('follows pagination across two fixture pages', () => {
    const p1 = readFileSync(path.join(fixturesDir, 'page1.html'), 'utf-8');
    const p2 = readFileSync(path.join(fixturesDir, 'page2.html'), 'utf-8');
    const next = findNextPageHref(p1, 'https://dir.example.org/list?page=1');
    expect(next).toContain('page=2');
    const combined = parseDirectoryHtmlPages([
      { html: p1, url: 'https://dir.example.org/list?page=1' },
      { html: p2, url: 'https://dir.example.org/list?page=2' },
    ]);
    expect(combined.length).toBe(3);
    const names = combined.map((c) => c.name).sort();
    expect(names).toEqual(['Page1 Co A', 'Page1 Co B', 'Page2 Co C']);
  });

  it('extracts table-linked company names (detail-page style listing)', () => {
    const html = readFileSync(path.join(fixturesDir, 'detail-list.html'), 'utf-8');
    const candidates = extractCandidatesFromHtml(html, 'https://members.example.com/dir');
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const names = candidates.map((c) => c.name);
    expect(names).toContain('Acme Industries');
    expect(names).toContain('Globex');
  });
});
