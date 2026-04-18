'use client'

/**
 * Manual QA page for prefers-reduced-motion behaviour in SplineHero.
 *
 * How to test:
 *   1. Visit /motion-test in the browser.
 *   2. The live indicator shows whether the OS "Reduce Motion" setting is on.
 *   3. Toggle OS reduce-motion setting:
 *        macOS  → System Settings → Accessibility → Display → Reduce Motion
 *        Windows → Settings → Ease of Access → Display → Show animations
 *   4. The component should switch between:
 *        OFF → Spline canvas (or "Spline canvas would load here" placeholder)
 *        ON  → Static SVG floor-plan fallback image, no animation
 *   5. No page reload should be needed — the mediaquery change fires live.
 *
 * Expected results matrix:
 *   ┌─────────────────────┬──────────────────────────────────────────────┐
 *   │ Reduce Motion       │ What SplineHero renders                      │
 *   ├─────────────────────┼──────────────────────────────────────────────┤
 *   │ OFF (default)       │ Spline 3D scene (canvas)                     │
 *   │ ON                  │ /hero-preview.svg via next/image (static)    │
 *   └─────────────────────┴──────────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react'
import { SplineHero } from '../../components/SplineHero'

// Placeholder URL — in production this would be a real .splinecode URL.
// The component degrades gracefully if the URL is invalid.
const PLACEHOLDER_SCENE = 'loading...'

export default function MotionTestPage() {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return (
    <div style={{ background: 'rgb(12,16,14)', minHeight: '100vh', color: 'white' }}>

      {/* Status banner */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(12,16,14,0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(34,197,94,0.15)',
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.5)' }}>prefers-reduced-motion:</span>
        {reduceMotion === null ? (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>detecting…</span>
        ) : reduceMotion ? (
          <span
            style={{
              color: 'rgb(34,197,94)',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.3)',
              padding: '2px 10px',
              borderRadius: 999,
            }}
          >
            ON — showing static fallback
          </span>
        ) : (
          <span
            style={{
              color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '2px 10px',
              borderRadius: 999,
            }}
          >
            OFF — showing Spline scene
          </span>
        )}

        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
          QA: SplineHero motion-toggle
        </span>
      </div>

      {/* Component under test */}
      <div style={{ paddingTop: 48 }}>
        <SplineHero scene={PLACEHOLDER_SCENE} />
      </div>

      {/* Instructions panel */}
      <div
        style={{
          padding: '32px 24px',
          maxWidth: 640,
          margin: '0 auto',
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        <h2 style={{ color: 'rgba(34,197,94,0.8)', marginBottom: 12, fontSize: 14 }}>
          How to verify
        </h2>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>
            Toggle <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Reduce Motion</strong> in
            your OS accessibility settings.
          </li>
          <li>
            Watch the banner above — it reflects the live media-query state.
          </li>
          <li>
            The hero section below the banner should switch between the{' '}
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Spline canvas</strong> (motion
            OFF) and the{' '}
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>static floor-plan SVG</strong>{' '}
            (motion ON) without a page reload.
          </li>
          <li>
            Confirm no jank, layout shift, or blank flash during the transition.
          </li>
        </ol>

        <div
          style={{
            marginTop: 24,
            padding: '12px 16px',
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 8,
          }}
        >
          <strong style={{ color: 'rgba(34,197,94,0.8)' }}>OS shortcuts</strong>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>macOS → System Settings → Accessibility → Display → Reduce Motion</span>
            <span>Windows → Settings → Accessibility → Visual Effects → Animation effects</span>
            <span>Chrome DevTools → Rendering tab → Emulate prefers-reduced-motion</span>
          </div>
        </div>
      </div>
    </div>
  )
}
