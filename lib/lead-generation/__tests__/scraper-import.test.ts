import { describe, it, expect } from 'vitest';
import { pickEmailFromScrapeResult, pickPhoneFromScrapeResult } from '../scraper-import';
import type { CompanyResult } from '@/lib/directory-scraper/types';

const base: Pick<CompanyResult, 'companyName' | 'directoryListingUrl' | 'companyWebsite' | 'confidence' | 'status'> = {
  companyName: 'Acme',
  directoryListingUrl: 'https://dir.com/a',
  companyWebsite: 'https://acme.com',
  confidence: 'high',
  status: 'done',
};

describe('pickEmailFromScrapeResult / pickPhoneFromScrapeResult', () => {
  it('uses top-level email and phone when set', () => {
    const r = { ...base, id: '1', email: 'a@acme.com', phone: '555' } as CompanyResult;
    expect(pickEmailFromScrapeResult(r)).toBe('a@acme.com');
    expect(pickPhoneFromScrapeResult(r)).toBe('555');
  });

  it('falls back to rawContact when top-level empty', () => {
    const r = {
      ...base,
      id: '2',
      email: '',
      phone: '',
      contactName: '',
      address: '',
      contactPageUrl: '',
      socialLinks: '',
      notes: '',
      rawContact: {
        emails: ['sales@acme.com', 'info@other.com'],
        phones: ['+1 800 555 0199'],
        addresses: [],
        contactPageUrls: [],
        socialLinks: [],
      },
    } as CompanyResult;
    expect(pickEmailFromScrapeResult(r)).toContain('acme');
    expect(pickPhoneFromScrapeResult(r)).toContain('800');
  });
});
