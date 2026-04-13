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
  'Needs Review',
];

/** Excel-friendly CSV: UTF-8 BOM, CRLF, RFC 4180 quoting */
export function escapeField(value: string): string {
  if (value == null || value === '') return '';
  const mustQuote =
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    /^[=+\-@]/.test(value);
  if (mustQuote) {
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
    r.needsReview ? 'yes' : 'no',
  ];
}

export function exportToCsv(results: CompanyResult[], options?: { includeBom?: boolean }): string {
  const includeBom = options?.includeBom !== false;
  const lines: string[] = [HEADERS.map(escapeField).join(',')];
  for (const r of results) {
    lines.push(resultToRow(r).map(escapeField).join(','));
  }
  const body = lines.join('\r\n');
  return includeBom ? `\uFEFF${body}` : body;
}

export function getResultHeaders(): string[] {
  return HEADERS;
}

export function resultToValues(r: CompanyResult): string[] {
  return resultToRow(r);
}
