import { describe, it, expect } from 'vitest';
import {
  buildAccountCreateData,
  buildManualWinsMerge,
  pickEmailFromScrapeResult,
  pickPhoneFromScrapeResult,
} from '../scraper-import';
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

  it('builds normalized identity on create payloads', () => {
    const result = {
      ...base,
      id: 'identity-1',
      email: '',
      phone: '',
      contactName: '',
      address: '',
      contactPageUrl: '',
      socialLinks: '',
      notes: '',
    } as CompanyResult;

    const createData = buildAccountCreateData({
      marketId: 'market-1',
      jobId: 'job-1',
      result,
      defaultCountry: 'Canada',
    });

    expect(createData.normalizedName).toBe('acme');
    expect(createData.normalizedDomain).toBe('acme.com');
  });

  it('applies Manual Wins merge behavior', () => {
    const incoming = {
      marketId: 'market-1',
      jobId: 'job-1',
      result: {
        ...base,
        id: 'manual-wins-1',
        email: 'sales@acme.com',
        phone: '+1 555 0100',
        contactName: '',
        address: '',
        contactPageUrl: '',
        socialLinks: '',
        notes: '',
      } as CompanyResult,
      defaultCountry: 'Canada',
    };
    const createData = buildAccountCreateData(incoming);
    const merge = buildManualWinsMerge(
      {
        id: 'account-1',
        name: 'Acme',
        normalizedName: 'acme',
        domain: '',
        normalizedDomain: '',
        website: '',
        email: 'owner@acme.com',
        phone: '',
        country: 'Canada',
        region: '',
        industry: '',
        subindustry: '',
        companySizeBand: 'unknown',
        revenueBand: 'unknown',
        description: '',
        sourceType: 'manual_upload',
        sourceName: '',
        sourceUrl: '',
        directoryJobId: null,
        directoryResultId: null,
        fitSummary: '',
        reviewState: 'new',
      },
      createData,
    );

    expect(merge.data.domain).toBe('acme.com');
    expect(merge.data.website).toBe('https://acme.com');
    expect(merge.filledFields).toContain('domain');
    expect(merge.filledFields).toContain('website');
    expect(merge.conflicts).toContain('email');
    expect(merge.data.reviewState).toBe('needs_review');
  });
});
