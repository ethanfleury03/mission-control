import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arrow Systems Inc — Internal Hub',
  description: 'Company internal apps hub — Arrow Systems Inc (arrsys.com)',
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
