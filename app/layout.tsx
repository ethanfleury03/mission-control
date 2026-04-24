import type { Metadata } from 'next';

import { auth } from '@/auth';

import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arrow Hub | Arrow Systems, Inc.',
  description: 'Internal company hub — Arrow Systems, Inc. (arrsys.com)',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="antialiased">
        <AppProviders session={session}>{children}</AppProviders>
      </body>
    </html>
  );
}
