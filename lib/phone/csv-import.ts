import type {
  ParsedPhoneCsvRow,
  PhoneCsvColumnMap,
  PhoneCsvPreview,
} from './types';
import { normalizePhone } from './phone-normalization';

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === ',') {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  out.push(current);
  return out.map((value) => value.trim());
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

export function inferPhoneColumnMap(headerCells: string[]): PhoneCsvColumnMap | null {
  const map: PhoneCsvColumnMap = {};
  const synonyms: Record<keyof PhoneCsvColumnMap, string[]> = {
    companyName: ['company', 'company name', 'account', 'organization', 'business'],
    contactName: ['contact', 'contact name', 'name', 'full name', 'person'],
    title: ['title', 'job title', 'role'],
    phone: ['phone', 'telephone', 'mobile', 'cell', 'tel'],
    email: ['email', 'e-mail', 'mail'],
    website: ['website', 'url', 'site', 'domain'],
    country: ['country', 'nation'],
    timezone: ['timezone', 'time zone', 'tz'],
    notes: ['notes', 'note', 'comments'],
  };

  headerCells.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    (Object.keys(synonyms) as (keyof PhoneCsvColumnMap)[]).forEach((field) => {
      if (synonyms[field].includes(normalized) && map[field] === undefined) {
        map[field] = String(index);
      }
    });
  });

  if (map.phone === undefined && map.companyName === undefined && map.contactName === undefined) {
    return null;
  }
  return map;
}

function rowValue(cells: string[], key: string | undefined): string {
  if (key === undefined || key === '') return '';
  const index = Number(key);
  if (!Number.isFinite(index) || index < 0 || index >= cells.length) return '';
  return cells[index] ?? '';
}

export function parsePhoneCsv(text: string): {
  header: string[];
  suggestedMap: PhoneCsvColumnMap | null;
  rows: ParsedPhoneCsvRow[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { header: [], suggestedMap: null, rows: [] };
  }

  const header = parseCsvLine(lines[0] ?? '');
  const suggestedMap = inferPhoneColumnMap(header);
  const rows: ParsedPhoneCsvRow[] = [];
  const seenDialable = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i] ?? '');
    const phoneRaw = rowValue(cells, suggestedMap?.phone);
    const phoneNormalized = normalizePhone(phoneRaw);
    const isValidPhone = phoneNormalized.length > 0;
    const isDuplicate = isValidPhone && seenDialable.has(phoneNormalized);
    if (isValidPhone) seenDialable.add(phoneNormalized);

    rows.push({
      rowNumber: i + 1,
      companyName: rowValue(cells, suggestedMap?.companyName),
      contactName: rowValue(cells, suggestedMap?.contactName),
      title: rowValue(cells, suggestedMap?.title),
      phoneRaw,
      phoneNormalized,
      email: rowValue(cells, suggestedMap?.email),
      website: rowValue(cells, suggestedMap?.website),
      country: rowValue(cells, suggestedMap?.country),
      timezone: rowValue(cells, suggestedMap?.timezone),
      notes: rowValue(cells, suggestedMap?.notes),
      isDuplicate,
      isValidPhone,
    });
  }

  return {
    header,
    suggestedMap,
    rows,
  };
}

export function previewPhoneCsvImport(text: string): PhoneCsvPreview {
  const parsed = parsePhoneCsv(text);
  const duplicateCount = parsed.rows.filter((row) => row.isDuplicate).length;
  const invalidPhoneCount = parsed.rows.filter((row) => !row.isValidPhone).length;
  const dialableCount = parsed.rows.filter((row) => row.isValidPhone && !row.isDuplicate).length;

  return {
    header: parsed.header,
    suggestedMap: parsed.suggestedMap,
    totalRows: parsed.rows.length,
    duplicateCount,
    invalidPhoneCount,
    dialableCount,
    rows: parsed.rows.slice(0, 12),
  };
}
