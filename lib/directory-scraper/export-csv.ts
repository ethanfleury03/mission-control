import type { CompanyResult } from './types';

const HEADERS = [
  'Company Name',
  'Directory Listing URL',
  'Company Website',
  'Contact Name',
  'Email',
  'Phone',
  'Address',
  'Contact Page URL',
  'Social Links',
  'Notes',
  'Confidence',
  'Status',
];

function escapeField(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function resultToRow(r: CompanyResult): string[] {
  return [
    r.companyName,
    r.directoryListingUrl,
    r.companyWebsite,
    r.contactName,
    r.email,
    r.phone,
    r.address,
    r.contactPageUrl,
    r.socialLinks,
    r.notes,
    r.confidence,
    r.status,
  ];
}

export function exportToCsv(results: CompanyResult[]): string {
  const lines: string[] = [HEADERS.map(escapeField).join(',')];
  for (const r of results) {
    lines.push(resultToRow(r).map(escapeField).join(','));
  }
  return lines.join('\n');
}

export function getResultHeaders(): string[] {
  return HEADERS;
}

export function resultToValues(r: CompanyResult): string[] {
  return resultToRow(r);
}
