import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicHttpUrl, validateScrapeUrl, validateScrapeUrlPublic } from '../validate-scrape-url';

describe('validateScrapeUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('blocks hostnames that resolve to loopback addresses', async () => {
    const r = await validateScrapeUrlPublic('http://loopback.test/private', {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });

    expect(r.ok).toBe(false);
  });

  it('blocks hostnames that resolve to private addresses', async () => {
    const r = await validateScrapeUrlPublic('https://private.test/dir', {
      lookup: async () => [{ address: '10.1.2.3', family: 4 }],
    });

    expect(r.ok).toBe(false);
  });

  it('allows hostnames that resolve to public addresses', async () => {
    const r = await validateScrapeUrlPublic('https://example.test/dir', {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    });

    expect(r.ok).toBe(true);
    expect(r.normalizedUrl).toBe('https://example.test/dir');
  });

  it('blocks redirects to private addresses', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://10.0.0.1/private' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicHttpUrl('https://example.test/dir', {}, {
      lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    })).rejects.toThrow(/private|loopback|not allowed/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
