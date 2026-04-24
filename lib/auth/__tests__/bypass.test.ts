import { afterEach, describe, expect, it } from 'vitest';

import { getAuthBypassEmail, isAuthBypassEnabled } from '../bypass';

const originalNodeEnv = process.env.NODE_ENV;
const originalBypass = process.env.AUTH_BYPASS_LOGIN;
const originalBypassEmail = process.env.AUTH_BYPASS_EMAIL;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.AUTH_BYPASS_LOGIN = originalBypass;
  process.env.AUTH_BYPASS_EMAIL = originalBypassEmail;
});

describe('auth bypass', () => {
  it('allows bypass in non-production when enabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_BYPASS_LOGIN = '1';

    expect(isAuthBypassEnabled()).toBe(true);
  });

  it('disables bypass in production even when env is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_BYPASS_LOGIN = '1';

    expect(isAuthBypassEnabled()).toBe(false);
  });

  it('falls back to a safe arrsys.com bypass email', () => {
    process.env.AUTH_BYPASS_EMAIL = 'not-valid@example.com';
    expect(getAuthBypassEmail()).toBe('dev@arrsys.com');
  });
});
