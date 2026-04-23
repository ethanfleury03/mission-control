import { describe, expect, it } from 'vitest';
import { inferPhoneColumnMap, parsePhoneCsv, previewPhoneCsvImport } from '../csv-import';

describe('inferPhoneColumnMap', () => {
  it('detects common phone list headers', () => {
    const map = inferPhoneColumnMap(['Company', 'Contact Name', 'Phone', 'Email']);
    expect(map?.companyName).toBe('0');
    expect(map?.contactName).toBe('1');
    expect(map?.phone).toBe('2');
    expect(map?.email).toBe('3');
  });
});

describe('parsePhoneCsv', () => {
  it('marks duplicates and invalid numbers', () => {
    const parsed = parsePhoneCsv([
      'Company,Contact Name,Phone',
      'Acme,Jane,(201) 555-0123',
      'Beta,John,(201) 555-0123',
      'Gamma,Sam,123',
    ].join('\n'));

    expect(parsed.rows[0]?.phoneNormalized).toBe('+12015550123');
    expect(parsed.rows[1]?.isDuplicate).toBe(true);
    expect(parsed.rows[2]?.isValidPhone).toBe(false);
  });
});

describe('previewPhoneCsvImport', () => {
  it('returns import health counts', () => {
    const preview = previewPhoneCsvImport([
      'Company,Contact Name,Phone',
      'Acme,Jane,(201) 555-0123',
      'Beta,John,123',
    ].join('\n'));

    expect(preview.totalRows).toBe(2);
    expect(preview.dialableCount).toBe(1);
    expect(preview.invalidPhoneCount).toBe(1);
  });
});
