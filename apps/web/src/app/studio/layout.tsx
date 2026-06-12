import Link from 'next/link'
import type { ReactNode } from 'react'

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(var(--bg-rgb), 0.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 48,
        gap: 24,
      }}>
        <Link href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgb(var(--muted-rgb))', textDecoration: 'none', letterSpacing: '0.04em' }}>
          ← ArchiVox
        </Link>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <Link
          href="/studio/render"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgb(var(--muted-rgb))', textDecoration: 'none', letterSpacing: '0.04em' }}
        >
          Render
        </Link>
        <Link
          href="/studio/portfolio"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgb(var(--muted-rgb))', textDecoration: 'none', letterSpacing: '0.04em' }}
        >
          Portfolio
        </Link>
      </nav>
      {children}
    </>
  )
}
