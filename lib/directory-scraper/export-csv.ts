import type { CompanyResult } from './types';

const HEADERS = [
  'Company Name',
  'Normalized Name',
  'Source URL',
  'Listing URL',
  'Detail URL',
  'Extraction Method',
  'Confidence',
  'Needs Review',
  'Source Selector',
  'Notes',
  'Company Website',
  'Contact Name',
  'Email',
  'Phone',
  'Address',
  'Contact Page URL',
  'Social Links',
  'Status',
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
  const m = r.nameExtractionMeta;
  const listing = m?.listingUrl ?? r.directoryListingUrl;
  const detail = m?.detailUrl ?? '';
  return [
    r.companyName,
    m?.normalizedName ?? '',
    r.directoryListingUrl,
    listing,
    detail,
    m?.extractionMethod ?? '',
    m?.confidenceLabel ?? r.confidence,
    r.needsReview ? 'yes' : 'no',
    m?.sourceSelector ?? '',
    [m?.reasons?.join('; '), r.notes].filter(Boolean).join(' | ') || r.notes,
    r.companyWebsite,
    r.contactName,
    r.email,
    r.phone,
    r.address,
    r.contactPageUrl,
    r.socialLinks,
    r.status,
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
