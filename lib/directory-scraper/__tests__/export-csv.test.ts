import { describe, it, expect } from 'vitest';
import { exportToCsv } from '../export-csv';
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
  };

  it('produces valid CSV with header and data row', () => {
    const csv = exportToCsv([sample]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Company Name');
    expect(lines[0]).toContain('Email');
  });

  it('escapes commas in fields', () => {
    const csv = exportToCsv([sample]);
    expect(csv).toContain('"Acme, Inc."');
  });

  it('handles empty results', () => {
    const csv = exportToCsv([]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Company Name');
  });
});
