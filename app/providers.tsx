'use client';

import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

import { AuthSessionTracker } from './components/AuthSessionTracker';

export function AppProviders({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <AuthSessionTracker />
      {children}
    </SessionProvider>
  );
}
