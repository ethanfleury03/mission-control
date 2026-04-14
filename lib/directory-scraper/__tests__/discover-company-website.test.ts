import { describe, expect, it } from 'vitest';
import { findDominantPlaceholderDomain, guessDomainsForCompany } from '../discover-company-website';

describe('guessDomainsForCompany', () => {
  it('produces slugged .com candidates from a typical name', () => {
    const d = guessDomainsForCompany('Acme Corporation');
    expect(d.some((h) => h === 'acmecorporation.com')).toBe(true);
  });

  it('handles ampersand', () => {
    const d = guessDomainsForCompany('Smith & Jones LLC');
    expect(d.some((h) => h.includes('smith'))).toBe(true);
  });
});

describe('findDominantPlaceholderDomain', () => {
  it('detects when most rows share one domain', () => {
    const rows = Array.from({ length: 10 }, () => ({ companyWebsite: 'https://www.aboutcoffee.org/' }));
    rows.push({ companyWebsite: 'https://starbucks.com/' });
    expect(findDominantPlaceholderDomain(rows)).toBe('aboutcoffee.org');
  });

  it('returns null when domains are diverse', () => {
    const rows = [
      { companyWebsite: 'https://a.com/' },
      { companyWebsite: 'https://b.com/' },
      { companyWebsite: 'https://c.com/' },
    ];
    expect(findDominantPlaceholderDomain(rows)).toBe(null);
  });
});
