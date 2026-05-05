import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

import { withActiveUser } from './with-active-user';
import { requireAuth } from './require-auth';

vi.mock('./require-auth', () => ({
  requireAuth: vi.fn(),
}));

const mockedRequireAuth = vi.mocked(requireAuth);

describe('withActiveUser', () => {
  beforeEach(() => {
    mockedRequireAuth.mockReset();
  });

  it('calls the handler for active sessions', async () => {
    mockedRequireAuth.mockResolvedValue({
      authed: { appUserId: 'u1', email: 'user@arrsys.com', hd: 'arrsys.com', role: 'user', status: 'active' },
    });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const response = await withActiveUser(handler)();

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns disabled-user responses before the handler runs', async () => {
    mockedRequireAuth.mockResolvedValue({
      response: NextResponse.json({ error: 'account_disabled' }, { status: 403 }),
    });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const response = await withActiveUser(handler)();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'account_disabled' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns auth lookup failures before the handler runs', async () => {
    mockedRequireAuth.mockResolvedValue({
      response: NextResponse.json({ error: 'auth_lookup_failed' }, { status: 503 }),
    });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));

    const response = await withActiveUser(handler)();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'auth_lookup_failed' });
    expect(handler).not.toHaveBeenCalled();
  });
});
