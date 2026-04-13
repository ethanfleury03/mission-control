import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arrow Hub | Arrow Systems, Inc.',
  description: 'Internal company hub — Arrow Systems, Inc. (arrsys.com)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
