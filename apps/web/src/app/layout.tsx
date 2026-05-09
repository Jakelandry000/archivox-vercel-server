import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/SmoothScroll';

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
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
    <html lang="en" className={`${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
