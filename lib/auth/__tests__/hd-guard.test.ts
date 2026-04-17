import { describe, it, expect } from 'vitest';

import { isAllowedGoogleProfile, ALLOWED_HD } from '../hd-guard';

describe('isAllowedGoogleProfile', () => {
  const good = {
    hd: ALLOWED_HD,
    email: 'alice@arrsys.com',
    email_verified: true,
  };

  it('allows a verified @arrsys.com Workspace profile', () => {
    expect(isAllowedGoogleProfile(good)).toBe(true);
  });

  it('allows case-insensitive email match', () => {
    expect(isAllowedGoogleProfile({ ...good, email: 'Alice@ARRSYS.com' })).toBe(true);
  });

  it('rejects null/undefined profile', () => {
    expect(isAllowedGoogleProfile(null)).toBe(false);
    expect(isAllowedGoogleProfile(undefined)).toBe(false);
  });

  it('rejects an unverified email even if hd looks right', () => {
    expect(isAllowedGoogleProfile({ ...good, email_verified: false })).toBe(false);
    expect(isAllowedGoogleProfile({ ...good, email_verified: 'true' as any })).toBe(false);
  });

  it('rejects a different hosted domain', () => {
    expect(isAllowedGoogleProfile({ ...good, hd: 'evil.com' })).toBe(false);
  });

  it('rejects a profile with no hd claim (personal gmail.com)', () => {
    expect(isAllowedGoogleProfile({ email: 'alice@gmail.com', email_verified: true })).toBe(false);
  });

  it('rejects hd=arrsys.com but email on a different domain (spoof attempt)', () => {
    expect(
      isAllowedGoogleProfile({ hd: ALLOWED_HD, email: 'alice@evil.com', email_verified: true }),
    ).toBe(false);
  });

  it('rejects non-string hd values', () => {
    expect(
      isAllowedGoogleProfile({ hd: 42 as any, email: 'alice@arrsys.com', email_verified: true }),
    ).toBe(false);
  });

  it('trims / normalizes hd whitespace + case', () => {
    expect(
      isAllowedGoogleProfile({ hd: ' ARRSYS.COM ', email: 'alice@arrsys.com', email_verified: true }),
    ).toBe(true);
  });
});
