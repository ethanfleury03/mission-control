import { describe, it, expect } from 'vitest';
import {
  extractEmails,
  extractPhones,
  extractSocialLinks,
  extractSocialLinksForCompany,
  normalizeDomain,
  normalizeUrl,
  scoreResult,
  dedupeCompanies,
  pickBestEmail,
  companyDedupeKey,
} from '../utils';
import type { CompanyResult } from '../types';

describe('extractEmails', () => {
  it('extracts simple emails from text', () => {
    const text = 'Contact us at sales@acme.com or support@acme.com';
    expect(extractEmails(text)).toEqual(['sales@acme.com', 'support@acme.com']);
  });

  it('extracts emails from mailto: links in HTML', () => {
    const html = '<a href="mailto:Info@Corp.com">Email us</a>';
    expect(extractEmails('', html)).toEqual(['info@corp.com']);
  });

  it('deduplicates and lowercases emails', () => {
    const text = 'hello@test.com HELLO@TEST.COM hello@test.com';
    expect(extractEmails(text)).toEqual(['hello@test.com']);
  });

  it('filters out noise emails', () => {
    const text = 'noreply@company.com user@example.com real@legit.io';
    const result = extractEmails(text);
    expect(result).toContain('real@legit.io');
    expect(result).not.toContain('user@example.com');
    expect(result).not.toContain('noreply@company.com');
  });

  it('filters out image-looking emails', () => {
    const text = 'icon@images.png logo@site.jpg';
    expect(extractEmails(text)).toEqual([]);
  });
});

describe('pickBestEmail', () => {
  it('prefers domain-matched email over generic', () => {
    const best = pickBestEmail(['info@other.com', 'jane@acme.com', 'contact@acme.com'], 'acme.com');
    expect(best).toBe('jane@acme.com');
  });
});

describe('extractPhones', () => {
  it('extracts phone from tel: links', () => {
    const html = '<a href="tel:+15550100">Call</a>';
    expect(extractPhones('', html)).toContain('+15550100');
  });

  it('extracts formatted phone numbers', () => {
    const text = 'Call us: (555) 012-3456 or +1-800-555-0199';
    const result = extractPhones(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('skips very short number-like strings', () => {
    const text = 'Room 42 and page 100';
    expect(extractPhones(text)).toEqual([]);
  });

  it('deduplicates phones', () => {
    const text = '555-012-3456 555-012-3456';
    const result = extractPhones(text);
    expect(result.length).toBe(1);
  });
});

describe('extractSocialLinks', () => {
  it('finds LinkedIn and Twitter links', () => {
    const urls = [
      'https://linkedin.com/company/acme',
      'https://twitter.com/acme',
      'https://acme.com/about',
    ];
    const result = extractSocialLinks(urls);
    expect(result).toContain('https://linkedin.com/company/acme');
    expect(result).toContain('https://twitter.com/acme');
    expect(result).not.toContain('https://acme.com/about');
  });

  it('handles www prefix', () => {
    const urls = ['https://www.facebook.com/acme'];
    expect(extractSocialLinks(urls)).toEqual(['https://www.facebook.com/acme']);
  });
});

describe('extractSocialLinksForCompany', () => {
  it('ranks paths containing company slug higher', () => {
    const urls = ['https://linkedin.com/in/random', 'https://linkedin.com/company/acmecorp'];
    const ranked = extractSocialLinksForCompany(urls, 'acmecorp.com');
    expect(ranked[0]).toContain('company/acmecorp');
  });
});

describe('normalizeDomain', () => {
  it('strips www and lowercases', () => {
    expect(normalizeDomain('https://WWW.Acme.COM/path')).toBe('acme.com');
  });

  it('adds protocol if missing', () => {
    expect(normalizeDomain('acme.com')).toBe('acme.com');
  });
});

describe('normalizeUrl', () => {
  it('resolves relative URLs', () => {
    expect(normalizeUrl('/about', 'https://acme.com')).toBe('https://acme.com/about');
  });

  it('passes through absolute URLs', () => {
    expect(normalizeUrl('https://acme.com/page')).toBe('https://acme.com/page');
  });
});

describe('scoreResult', () => {
  const base: CompanyResult = {
    id: '1',
    companyName: 'Test',
    directoryListingUrl: 'https://dir.com/test',
    companyWebsite: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    contactPageUrl: '',
    socialLinks: '',
    notes: '',
    confidence: 'low',
    status: 'done',
  };

  it('high when email and phone on listing', () => {
    const r = scoreResult(
      { ...base, email: 'a@b.com', phone: '555' },
      { emailFromListing: true, phoneFromListing: true },
    );
    expect(r.score).toBe('high');
  });

  it('high when email matches company domain', () => {
    const r = scoreResult({
      ...base,
      email: 'sales@acme.com',
      companyWebsite: 'https://www.acme.com',
    });
    expect(r.score).toBe('high');
    expect(r.reason).toContain('company domain');
  });

  it('medium when email and phone without listing flags', () => {
    const r = scoreResult({ ...base, email: 'a@b.com', phone: '555' });
    expect(r.score).toBe('medium');
  });

  it('medium when phone only on company site', () => {
    const r = scoreResult({ ...base, phone: '5555555555', companyWebsite: 'https://co.com' });
    expect(r.score).toBe('medium');
  });

  it('low when social only', () => {
    expect(scoreResult({ ...base, socialLinks: 'https://linkedin.com/x' }).score).toBe('low');
  });

  it('low when nothing', () => {
    expect(scoreResult(base).score).toBe('low');
  });
});

describe('dedupeCompanies', () => {
  it('collapses same normalized name on same directory host', () => {
    const entries = [
      { name: 'Acme Corp', url: 'https://dir.com/acme' },
      { name: 'acme corp', url: 'https://dir.com/acme-2' },
      { name: 'Globex', url: 'https://dir.com/globex' },
    ];
    const result = dedupeCompanies(entries);
    expect(result.length).toBe(2);
  });
});

describe('companyDedupeKey', () => {
  it('uses company site domain when distinct from directory', () => {
    const k1 = companyDedupeKey('Acme', 'https://dir.com/a', 'https://acme.com');
    const k2 = companyDedupeKey('Acme', 'https://dir.com/b', 'https://acme.com');
    expect(k1).toBe(k2);
  });
});
