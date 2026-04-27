import { describe, expect, it } from 'vitest';

import { ADMIN_EMAIL, isAdminEmail } from '../constants';

describe('isAdminEmail', () => {
  it('allows only the primary v1 admin email', () => {
    expect(isAdminEmail(ADMIN_EMAIL)).toBe(true);
    expect(isAdminEmail(' ethan@arrsys.com ')).toBe(true);
    expect(isAdminEmail('ETHAN@ARRSYS.COM')).toBe(true);
  });

  it('rejects other Arrow users and missing values', () => {
    expect(isAdminEmail('someone@arrsys.com')).toBe(false);
    expect(isAdminEmail('ethan@example.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });
});
