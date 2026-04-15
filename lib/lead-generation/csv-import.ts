/**
 * Minimal CSV line parser (quoted fields, commas). One row = one line.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export type CsvColumnMap = {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  domain?: string;
  country?: string;
  region?: string;
  industry?: string;
};

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase();
}

/** Guess column keys from header row (English synonyms). */
export function inferColumnMap(headerCells: string[]): CsvColumnMap | null {
  const map: CsvColumnMap = { name: '' };
  const synonyms: Record<keyof CsvColumnMap, string[]> = {
    name: ['name', 'company', 'company name', 'organization', 'title'],
    email: ['email', 'e-mail', 'mail'],
    phone: ['phone', 'telephone', 'tel', 'mobile'],
    website: ['website', 'url', 'web', 'company url', 'site'],
    domain: ['domain'],
    country: ['country', 'nation'],
    region: ['region', 'state', 'province'],
    industry: ['industry', 'sector', 'vertical'],
  };

  headerCells.forEach((cell, idx) => {
    const k = normHeader(cell);
    (Object.keys(synonyms) as (keyof CsvColumnMap)[]).forEach((field) => {
      if (synonyms[field].includes(k) || k === String(field)) {
        if (field === 'name') map.name = String(idx);
        else map[field] = String(idx);
      }
    });
  });

  if (map.name === '') return null;
  return map;
}

export function rowValue(cells: string[], key: string | undefined): string {
  if (key === undefined || key === '') return '';
  const i = Number(key);
  if (!Number.isFinite(i) || i < 0 || i >= cells.length) return '';
  return cells[i] ?? '';
}
