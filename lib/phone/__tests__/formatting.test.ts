import { describe, expect, it } from 'vitest';
import { formatCurrencyFromCents } from '../formatting';

describe('formatCurrencyFromCents', () => {
  it('renders Retell combined cost cents as USD', () => {
    expect(formatCurrencyFromCents(178)).toBe('$1.78');
    expect(formatCurrencyFromCents(4)).toBe('$0.04');
    expect(formatCurrencyFromCents(null)).toBe('$0.00');
  });
});
