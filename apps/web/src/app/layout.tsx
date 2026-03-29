import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ArchiVox — Architectural Copilot',
  description: 'Generate layouts, 2D plans, and AutoCAD scripts from plain language.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
