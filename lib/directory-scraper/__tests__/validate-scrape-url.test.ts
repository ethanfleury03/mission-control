import { describe, it, expect } from 'vitest';
import { validateScrapeUrl } from '../validate-scrape-url';

describe('validateScrapeUrl', () => {
  it('allows public https', () => {
    const r = validateScrapeUrl('https://example.com/dir');
    expect(r.ok).toBe(true);
    expect(r.normalizedUrl).toContain('example.com');
  });

  it('blocks localhost', () => {
    expect(validateScrapeUrl('http://localhost:3000').ok).toBe(false);
  });

  it('blocks 127.0.0.1', () => {
    expect(validateScrapeUrl('http://127.0.0.1/').ok).toBe(false);
  });

  it('blocks private 10.x', () => {
    expect(validateScrapeUrl('https://10.0.0.1/').ok).toBe(false);
  });

  it('blocks 192.168.x', () => {
    expect(validateScrapeUrl('http://192.168.1.1').ok).toBe(false);
  });

  it('blocks file and javascript protocols', () => {
    expect(validateScrapeUrl('file:///etc/passwd').ok).toBe(false);
  });
});
