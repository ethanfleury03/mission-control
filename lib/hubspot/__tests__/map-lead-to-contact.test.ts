import { describe, expect, it } from 'vitest';
import { mapAccountToHubSpotProperties, placeholderEmailForAccount } from '../map-lead-to-contact';
import type { Account, Market } from '@/lib/lead-generation/types';

const baseAccount = (over: Partial<Account>): Account => ({
  id: 'acc-test',
  marketId: 'm1',
  name: 'Acme Corp',
  domain: 'acme.com',
  website: 'https://acme.com',
  email: '',
  phone: '',
  country: 'Canada',
  region: '',
  industry: '',
  subindustry: '',
  companySizeBand: 'unknown',
  revenueBand: 'unknown',
  description: '',
  sourceType: 'internal_scraper',
  sourceName: '',
  sourceUrl: '',
  status: 'prospect',
  fitScore: 0,
  fitSummary: '',
  assignedOwner: '',
  reviewState: 'new',
  lastSeenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

const market: Market = {
  id: 'm1',
  slug: 'test',
  name: 'Test market',
  description: '',
  countries: [],
  targetPersonas: [],
  solutionAreas: [],
  status: 'active',
  notes: '',
  companyCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('mapAccountToHubSpotProperties', () => {
  it('uses real email when present', () => {
    const p = mapAccountToHubSpotProperties(
      baseAccount({ email: 'a@acme.com' }),
      market,
    );
    expect(p.email).toBe('a@acme.com');
  });

  it('adds placeholder email when only phone+website', () => {
    const p = mapAccountToHubSpotProperties(
      baseAccount({ email: '', phone: '+1 555 123 4567', website: 'https://acme.com' }),
      market,
    );
    expect(p.email).toBe(placeholderEmailForAccount('acc-test'));
  });
});
