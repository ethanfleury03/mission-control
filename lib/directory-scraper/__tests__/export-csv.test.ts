import { describe, it, expect } from 'vitest';
import { exportToCsv, escapeField } from '../export-csv';
import type { CompanyResult } from '../types';

describe('exportToCsv', () => {
  const sample: CompanyResult = {
    id: '1',
    companyName: 'Acme, Inc.',
    directoryListingUrl: 'https://dir.com/acme',
    companyWebsite: 'https://acme.com',
    contactName: 'John Doe',
    email: 'john@acme.com',
    phone: '+1-555-0100',
    address: '123 Main St, Anytown, CA 90210',
    contactPageUrl: 'https://acme.com/contact',
    socialLinks: 'https://linkedin.com/company/acme',
    notes: 'Email and phone found',
    confidence: 'high',
    status: 'done',
    needsReview: false,
  };

  it('produces valid CSV with header and data row', () => {
    const csv = exportToCsv([sample], { includeBom: false });
    const lines = csv.split(/\r\n/);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Company Name');
    expect(lines[0]).toContain('Email');
    expect(lines[0]).toContain('Needs Review');
  });

  it('includes UTF-8 BOM by default for Excel', () => {
    const csv = exportToCsv([sample]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes commas in fields', () => {
    const csv = exportToCsv([sample], { includeBom: false });
    expect(csv).toContain('"Acme, Inc."');
  });

  it('quotes fields that start with formula injection chars for Excel', () => {
    expect(escapeField("=1+1")).toMatch(/^"/);
    expect(escapeField('+123')).toMatch(/^"/);
  });

  it('handles empty results', () => {
    const csv = exportToCsv([], { includeBom: false });
    const lines = csv.split(/\r\n/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Company Name');
  });
});
