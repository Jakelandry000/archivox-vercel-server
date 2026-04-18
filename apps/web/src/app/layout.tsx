import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SmoothScroll } from '@/components/SmoothScroll';

const bigShouldersDisplay = localFont({
  src: [
    { path: '../../public/fonts/big-shoulders-display-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../public/fonts/big-shoulders-display-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: '../../public/fonts/big-shoulders-display-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://archivox.vercel.app'),
  title: 'ArchiVox — Architectural Copilot',
  description: 'Generate layouts, 2D plans, and AutoCAD scripts from plain language.',
  openGraph: {
    title: 'ArchiVox — Architectural Copilot',
    description: 'Generate layouts, 2D plans, and AutoCAD scripts from plain language.',
    url: 'https://archivox.vercel.app',
    siteName: 'ArchiVox',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ArchiVox — AI-powered architectural design copilot',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ArchiVox — Architectural Copilot',
    description: 'Generate layouts, 2D plans, and AutoCAD scripts from plain language.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bigShouldersDisplay.variable}>
      <body className="antialiased">
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
