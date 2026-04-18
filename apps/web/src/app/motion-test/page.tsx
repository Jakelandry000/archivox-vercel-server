'use client'

/**
 * Manual QA page for prefers-reduced-motion behaviour in HeroSection.
 *
 * How to test:
 *   1. Visit /motion-test in the browser.
 *   2. The live indicator shows whether the OS "Reduce Motion" setting is on.
 *   3. Toggle OS reduce-motion setting:
 *        macOS  → System Settings → Accessibility → Display → Reduce Motion
 *        Windows → Settings → Accessibility → Visual Effects → Animation effects
 *        Chrome DevTools → Rendering tab → Emulate prefers-reduced-motion
 *   4. The component should switch between:
 *        OFF → Blueprint SVG animates in (Framer Motion pathLength transitions)
 *        ON  → Blueprint SVG renders instantly (all transitions duration: 0)
 *   5. No page reload should be needed — the mediaquery change fires live.
 *
 * Expected results matrix:
 *   ┌─────────────────────┬──────────────────────────────────────────────────┐
 *   │ Reduce Motion       │ What HeroSection renders                         │
 *   ├─────────────────────┼──────────────────────────────────────────────────┤
 *   │ OFF (default)       │ Blueprint animates; typewriter cycles            │
 *   │ ON                  │ Blueprint fully visible instantly; prompt static │
 *   └─────────────────────┴──────────────────────────────────────────────────┘
 */

import { HeroSection } from '../../components/HeroSection'
import { useReducedMotion } from '../../lib/hooks/useReducedMotion'

export default function MotionTestPage() {
  const reduceMotion = useReducedMotion()

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
        {reduceMotion ? (
          <span
            style={{
              color: 'rgb(34,197,94)',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.3)',
              padding: '2px 10px',
              borderRadius: 999,
            }}
          >
            ON — blueprint static
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
            OFF — blueprint animating
          </span>
        )}

        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
          QA: HeroSection motion-toggle
        </span>
      </div>

      {/* Component under test */}
      <div style={{ paddingTop: 48 }}>
        <HeroSection />
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
            The hero section should switch between{' '}
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>animated blueprint</strong> (motion
            OFF) and{' '}
            <strong style={{ color: 'rgba(255,255,255,0.7)' }}>instant static blueprint</strong>{' '}
            (motion ON) without a page reload.
          </li>
          <li>
            Confirm the typewriter prompt cycles (motion OFF) or shows the first prompt
            statically (motion ON).
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
