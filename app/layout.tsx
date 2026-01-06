import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RTG Invoice Tracker',
  description: 'Upload and view weekly invoice spreadsheets',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

