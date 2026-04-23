import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, normalizePhone } from '../phone-normalization';

describe('normalizePhone', () => {
  it('normalizes common US local numbers to E.164', () => {
    expect(normalizePhone('(201) 555-0123')).toBe('+12015550123');
  });

  it('preserves explicit international numbers', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('returns an empty string for invalid numbers', () => {
    expect(normalizePhone('555')).toBe('');
  });
});

describe('formatPhoneForDisplay', () => {
  it('formats normalized US numbers for UI display', () => {
    expect(formatPhoneForDisplay('+12015550123')).toBe('(201) 555-0123');
  });
});
