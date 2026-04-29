'use client';

import { signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';

const SESSION_EVENT_PREFIX = 'mc_session_event';
const SESSION_EVENT_INTERVAL_MS = 10 * 60 * 1000;

export function AuthSessionTracker() {
  const { data: session, status } = useSession();
  const email = session?.user?.email?.toLowerCase() || '';
  const appUserId = session?.appUserId || email;

  useEffect(() => {
    if (status !== 'authenticated' || !email) return;

    const key = `${SESSION_EVENT_PREFIX}:${appUserId}`;
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(key) || '0');
    if (Number.isFinite(last) && now - last < SESSION_EVENT_INTERVAL_MS) return;
    window.sessionStorage.setItem(key, String(now));

    let cancelled = false;
    void fetch('/api/auth/session-event', { method: 'POST' })
      .then(async (response) => {
        if (cancelled || response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (response.status === 403 && data?.error === 'account_disabled') {
          await signOut({ callbackUrl: '/signin?error=AccessDenied&signedOut=1' });
        }
      })
      .catch(() => {
        /* Session tracking must never break app rendering. */
      });

    return () => {
      cancelled = true;
    };
  }, [appUserId, email, status]);

  return null;
}
