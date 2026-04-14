import { describe, expect, it } from 'vitest';
import { guessDomainsForCompany } from '../discover-company-website';

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
