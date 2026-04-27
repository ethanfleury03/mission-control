import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAuthBypassEmail, isAuthBypassEnabled } from '../bypass';

const originalNodeEnv = process.env.NODE_ENV;
const originalBypass = process.env.AUTH_BYPASS_LOGIN;
const originalBypassEmail = process.env.AUTH_BYPASS_EMAIL;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalNodeEnv !== undefined) vi.stubEnv('NODE_ENV', originalNodeEnv);
  if (originalBypass !== undefined) vi.stubEnv('AUTH_BYPASS_LOGIN', originalBypass);
  if (originalBypassEmail !== undefined) vi.stubEnv('AUTH_BYPASS_EMAIL', originalBypassEmail);
});

describe('auth bypass', () => {
  it('allows bypass in non-production when enabled', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_BYPASS_LOGIN', '1');

    expect(isAuthBypassEnabled()).toBe(true);
  });

  it('disables bypass in production even when env is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_BYPASS_LOGIN', '1');

    expect(isAuthBypassEnabled()).toBe(false);
  });

  it('falls back to a safe arrsys.com bypass email', () => {
    process.env.AUTH_BYPASS_EMAIL = 'not-valid@example.com';
    expect(getAuthBypassEmail()).toBe('dev@arrsys.com');
  });
});
