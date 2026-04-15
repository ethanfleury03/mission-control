import { describe, expect, it } from 'vitest';
import { inferColumnMap, parseCsvLine } from '../csv-import';

describe('parseCsvLine', () => {
  it('handles quoted commas', () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });
});

describe('inferColumnMap', () => {
  it('detects name and company columns', () => {
    const m = inferColumnMap(['Company', 'Email', 'Phone']);
    expect(m?.name).toBe('0');
    expect(m?.email).toBe('1');
    expect(m?.phone).toBe('2');
  });
});
