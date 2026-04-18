'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Spline from '@splinetool/react-spline'
import { motion } from 'framer-motion'
import type { Application } from '@splinetool/runtime'

// ─── types ───────────────────────────────────────────────────────────────────

interface SplineHeroProps {
  scene?: string
  className?: string
  onLoad?: (app: Application) => void
}

// ─── constants ───────────────────────────────────────────────────────────────

const PROMPTS = [
  '3-bedroom family home, open plan kitchen, south-facing garden',
  'compact studio apartment, maximised storage, city-centre lot',
  'two-storey townhouse, home office, rooftop terrace access',
  'eco-retreat, passive solar, rammed earth walls, north light',
] as const

// ─── util ────────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── hooks ───────────────────────────────────────────────────────────────────

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduce(!!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  return reduce
}

function useCursorFollow(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState({ x: 50, y: 40 })
  const [inside, setInside] = useState(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect()
      setPos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      })
    }
    function onEnter() { setInside(true) }
    function onLeave() { setInside(false) }
    el.addEventListener('mousemove', onMove, { passive: true })
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [containerRef])
  return { pos, inside }
}

// ─── BlueprintBackground ─────────────────────────────────────────────────────
// Animated architectural floor plan drawn in via pathLength on mount.
// Serves as the "architectural imagery" layer when no Spline scene URL
// has been configured. Opacity is kept low so it reads as atmosphere,
// not content — the narrative text remains the visual anchor.

function BlueprintBackground({ reduce }: { reduce: boolean }) {
  function wall(delay: number, duration = 0.85) {
    return {
      initial: { pathLength: 0, opacity: 0 },
      animate: { pathLength: 1, opacity: 1 },
      transition: reduce
        ? { duration: 0 }
        : {
            pathLength: { duration, delay, ease: 'easeOut' },
            opacity: { duration: 0.15, delay },
          },
    }
  }

  function label(delay: number) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: reduce ? { duration: 0 } : { duration: 0.35, delay },
    }
  }

  return (
    <svg
      viewBox="0 0 1200 700"
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{ opacity: 0.065 }}
    >
      {/* Outer building boundary */}
      <motion.rect
        x="80" y="60" width="1040" height="580"
        fill="none" stroke="rgba(34,197,94,1)" strokeWidth="2.5"
        {...wall(0.2, 1.4)}
      />

      {/* Horizontal internal walls */}
      <motion.line x1="80" y1="350" x2="700" y2="350"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(1.2)} />
      <motion.line x1="80" y1="490" x2="700" y2="490"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(1.4)} />
      <motion.line x1="700" y1="280" x2="1120" y2="280"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(1.3)} />

      {/* Vertical internal walls */}
      <motion.line x1="700" y1="60" x2="700" y2="640"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(0.8, 1.0)} />
      <motion.line x1="400" y1="60" x2="400" y2="490"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(1.0)} />
      <motion.line x1="940" y1="280" x2="940" y2="640"
        stroke="rgba(34,197,94,0.8)" strokeWidth="1.5" {...wall(1.5)} />

      {/* Door arcs */}
      <motion.path d="M 400 350 A 50 50 0 0 0 450 300"
        fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="1"
        strokeDasharray="3 4" {...wall(2.0)} />
      <motion.path d="M 700 350 A 45 45 0 0 1 745 305"
        fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="1"
        strokeDasharray="3 4" {...wall(2.1)} />
      <motion.path d="M 80 490 A 50 50 0 0 0 130 440"
        fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="1"
        strokeDasharray="3 4" {...wall(2.2)} />

      {/* Construction / guide lines extending beyond boundary */}
      <motion.line x1="0" y1="350" x2="80" y2="350"
        stroke="rgba(34,197,94,0.18)" strokeWidth="0.5" strokeDasharray="6 4" {...wall(0.5)} />
      <motion.line x1="1120" y1="350" x2="1200" y2="350"
        stroke="rgba(34,197,94,0.18)" strokeWidth="0.5" strokeDasharray="6 4" {...wall(0.5)} />
      <motion.line x1="700" y1="0" x2="700" y2="60"
        stroke="rgba(34,197,94,0.18)" strokeWidth="0.5" strokeDasharray="6 4" {...wall(0.6)} />
      <motion.line x1="700" y1="640" x2="700" y2="700"
        stroke="rgba(34,197,94,0.18)" strokeWidth="0.5" strokeDasharray="6 4" {...wall(0.6)} />

      {/* Top dimension line */}
      <motion.line x1="80" y1="50" x2="1120" y2="50"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.8)} />
      <motion.line x1="80" y1="45" x2="80" y2="55"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.85)} />
      <motion.line x1="1120" y1="45" x2="1120" y2="55"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.85)} />
      <motion.text x="600" y="43" textAnchor="middle" fontFamily="monospace"
        fontSize="11" fill="rgba(34,197,94,0.45)" {...label(2.0)}>
        18 000
      </motion.text>

      {/* Left dimension line */}
      <motion.line x1="68" y1="60" x2="68" y2="640"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.9)} />
      <motion.line x1="62" y1="60" x2="74" y2="60"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.95)} />
      <motion.line x1="62" y1="640" x2="74" y2="640"
        stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" {...wall(1.95)} />
      <motion.text x="58" y="356" textAnchor="middle" fontFamily="monospace"
        fontSize="11" fill="rgba(34,197,94,0.45)"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        {...label(2.1)}>
        10 000
      </motion.text>

      {/* Room labels */}
      {([
        { x: 240, y: 210, t: 'LIVING ROOM' },
        { x: 240, y: 430, t: 'BEDROOM 1' },
        { x: 240, y: 570, t: 'BEDROOM 2' },
        { x: 570, y: 210, t: 'STUDY' },
        { x: 910, y: 172, t: 'KITCHEN' },
        { x: 910, y: 460, t: 'DINING' },
        { x: 1040, y: 470, t: 'GARAGE' },
      ] as const).map(({ x, y, t }) => (
        <motion.text key={t} x={x} y={y}
          textAnchor="middle" fontFamily="monospace" fontSize="13"
          letterSpacing="2" fill="rgba(34,197,94,0.4)"
          {...label(2.4)}>
          {t}
        </motion.text>
      ))}

      {/* Scale bar */}
      <motion.g {...label(2.5)}>
        <line x1="920" y1="655" x2="1070" y2="655" stroke="rgba(34,197,94,0.5)" strokeWidth="1" />
        <line x1="920" y1="650" x2="920" y2="660" stroke="rgba(34,197,94,0.5)" strokeWidth="1" />
        <line x1="995" y1="650" x2="995" y2="660" stroke="rgba(34,197,94,0.5)" strokeWidth="1" />
        <line x1="1070" y1="650" x2="1070" y2="660" stroke="rgba(34,197,94,0.5)" strokeWidth="1" />
        <text x="995" y="672" textAnchor="middle" fontFamily="monospace"
          fontSize="10" fill="rgba(34,197,94,0.45)">1 : 100</text>
      </motion.g>

      {/* Compass rose */}
      <motion.g {...label(2.3)}>
        <line x1="130" y1="628" x2="130" y2="608" stroke="rgba(34,197,94,0.65)" strokeWidth="1.5" />
        <polygon points="130,605 126,614 134,614" fill="rgba(34,197,94,0.65)" />
        <text x="130" y="603" textAnchor="middle" fontFamily="monospace"
          fontSize="10" fill="rgba(34,197,94,0.7)">N</text>
        <circle cx="130" cy="635" r="14" fill="none"
          stroke="rgba(34,197,94,0.3)" strokeWidth="0.75" />
      </motion.g>

      {/* Grid references */}
      {(['A', 'B', 'C', 'D', 'E'] as const).map((ch, i) => (
        <motion.text key={ch}
          x={[80, 400, 700, 940, 1120][i]} y={662}
          textAnchor="middle" fontFamily="monospace" fontSize="9"
          fill="rgba(34,197,94,0.28)" {...label(2.6)}>
          {ch}
        </motion.text>
      ))}
      {([1, 2, 3, 4, 5] as const).map((n, i) => (
        <motion.text key={n}
          x={1140} y={[60, 280, 350, 490, 640][i]}
          textAnchor="start" fontFamily="monospace" fontSize="9"
          fill="rgba(34,197,94,0.28)" {...label(2.6)}>
          {n}
        </motion.text>
      ))}

      {/* Title block */}
      <motion.rect x="922" y="62" width="196" height="62"
        fill="none" stroke="rgba(34,197,94,0.28)" strokeWidth="0.75" {...wall(2.2)} />
      <motion.text x="1020" y="84" textAnchor="middle" fontFamily="monospace"
        fontSize="9" letterSpacing="2" fill="rgba(34,197,94,0.4)" {...label(2.7)}>
        ARCHIVOX
      </motion.text>
      <motion.text x="1020" y="97" textAnchor="middle" fontFamily="monospace"
        fontSize="8" fill="rgba(34,197,94,0.3)" {...label(2.7)}>
        CONCEPT FLOOR PLAN
      </motion.text>
      <motion.text x="1020" y="110" textAnchor="middle" fontFamily="monospace"
        fontSize="8" fill="rgba(34,197,94,0.3)" {...label(2.7)}>
        DRAWING NO. AX-001
      </motion.text>
    </svg>
  )
}

// ─── CyclingPrompt ───────────────────────────────────────────────────────────
// Typewriter that cycles through architectural briefs, demonstrating the
// kind of plain-English input ArchiVox accepts. Reinforces the "voice"
// concept without being visually dominant.

function CyclingPrompt({ reduce }: { reduce: boolean }) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState(reduce ? PROMPTS[0] : '')

  useEffect(() => {
    if (reduce) {
      setText(PROMPTS[0])
      return
    }
    let cancelled = false
    async function cycle() {
      const prompt = PROMPTS[index]
      for (let i = 1; i <= prompt.length; i++) {
        if (cancelled) return
        setText(prompt.slice(0, i))
        await wait(28)
      }
      await wait(1800)
      for (let i = prompt.length - 1; i >= 0; i--) {
        if (cancelled) return
        setText(prompt.slice(0, i))
        await wait(14)
      }
      await wait(300)
      if (!cancelled) setIndex(i => (i + 1) % PROMPTS.length)
    }
    cycle()
    return () => { cancelled = true }
  }, [index, reduce])

  return (
    <div
      className="font-mono text-xs"
      style={{ color: 'rgba(34,197,94,0.55)', minHeight: '1.2em' }}
    >
      <span style={{ color: 'rgba(235,244,238,0.2)' }}>{'▸ '}</span>
      {text}
      {!reduce && (
        <span
          className="inline-block w-px h-3 ml-px align-middle"
          style={{ background: 'rgb(var(--accent))', animation: 'pulse 1s step-end infinite' }}
        />
      )}
    </div>
  )
}

// ─── LogoMark ────────────────────────────────────────────────────────────────
// Animated mark + wordmark that opens the narrative sequence, establishing
// brand identity before the headline text arrives.

function LogoMark({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2 mb-8"
      initial={reduce ? undefined : { opacity: 0, scale: 0.75 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="h-12 w-12 rounded-2xl grid place-items-center"
        style={{
          background: 'rgba(18,26,22,0.9)',
          border: '1px solid rgba(34,197,94,0.25)',
          boxShadow: '0 0 32px rgba(34,197,94,0.15)',
        }}
      >
        <div
          className="h-5 w-5 rounded-lg"
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))',
          }}
        />
      </div>
      <span
        className="text-[10px] font-semibold uppercase"
        style={{ color: 'rgba(235,244,238,0.35)', letterSpacing: '0.25em' }}
      >
        ArchiVox
      </span>
    </motion.div>
  )
}

// ─── HeroNarrative ───────────────────────────────────────────────────────────
// Staggered content stack: logo → badge → headline → subtitle → CTAs → prompt.
// Each element fades-up in sequence to create a top-to-bottom reading flow
// that guides the eye through the ArchiVox value proposition.

function HeroNarrative({ reduce }: { reduce: boolean }) {
  function fadeUp(delay: number) {
    return {
      initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
      animate: { opacity: 1, y: 0 },
      transition: reduce
        ? { duration: 0 }
        : { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
    }
  }

  return (
    <div className="flex flex-col items-center text-center max-w-3xl">
      <LogoMark reduce={reduce} />

      {/* Badge */}
      <motion.div
        {...fadeUp(0.2)}
        className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style={{
          borderColor: 'rgba(34,197,94,0.2)',
          background: 'rgba(34,197,94,0.08)',
          color: 'rgb(var(--accent))',
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} />
        Early access
      </motion.div>

      {/* Headline — Big Shoulders Display 900, dominates the hero viewport */}
      <motion.h1
        {...fadeUp(0.4)}
        className="font-display text-[clamp(3.5rem,10vw,7rem)] font-black leading-[0.95] tracking-tight uppercase"
        style={{ fontFamily: 'var(--font-display), ui-sans-serif, system-ui', fontWeight: 900 }}
      >
        Architectural{' '}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(34,197,94,1) 0%, rgba(16,185,129,1) 100%)',
          }}
        >
          layouts
        </span>
        <br />
        <span style={{ color: 'rgba(235,244,238,0.75)' }}>from plain</span>
        <br />
        language.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        {...fadeUp(0.6)}
        className="mt-6 text-lg leading-relaxed max-w-lg"
        style={{ color: 'rgba(235,244,238,0.55)' }}
      >
        Describe a home in plain English. ArchiVox generates a 2D floor plan,
        AutoCAD script, and a full validation report — instantly.
      </motion.p>

      {/* CTAs */}
      <motion.div
        {...fadeUp(0.75)}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Link href="/signin" className="btn btn-primary px-8 py-3 text-base">
          Get started
        </Link>
        <Link
          href="/generator"
          className="btn btn-ghost px-8 py-3 text-base"
          style={{ color: 'rgba(235,244,238,0.75)' }}
        >
          Try demo ↗
        </Link>
      </motion.div>

      {/* Cycling architectural prompt */}
      <motion.div
        {...fadeUp(0.95)}
        className="mt-8 px-4 py-2.5 rounded-xl"
        style={{
          background: 'rgba(12,16,14,0.65)',
          border: '1px solid rgba(34,197,94,0.1)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <CyclingPrompt reduce={reduce} />
      </motion.div>
    </div>
  )
}

// ─── SplineHero ───────────────────────────────────────────────────────────────

/**
 * Full-viewport hero section. Layer stack:
 *
 *   1. bg-grid — subtle emerald grid at 6% opacity
 *   2a. Spline 3D scene — when `scene` is a valid https URL
 *   2b. AnimatedBlueprint SVG — floor plan draws in when no Spline scene
 *   3. Cursor-follow ambient glow — 700px radial, lerps via CSS transition
 *   4. Vignette — edge darkening
 *   5. HeroNarrative — logo → badge → h1 → subtitle → CTAs → typewriter prompt
 *   6. Scroll cue
 *
 * When a Spline scene URL is configured (via NEXT_PUBLIC_SPLINE_HERO_URL),
 * layers 2a and 3 combine to deliver the interactive 3D experience. Without
 * a URL the animated blueprint provides equivalent architectural atmosphere.
 *
 * Usage:
 *   <SplineHero scene={process.env.NEXT_PUBLIC_SPLINE_HERO_URL} />
 *
 * Scene URL: spline.design → Share → Embed → Copy URL (.splinecode)
 * Set NEXT_PUBLIC_SPLINE_HERO_URL in .env.local to activate the 3D scene.
 */
export function SplineHero({ scene, className, onLoad }: SplineHeroProps) {
  const reduce = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const { pos: cursor, inside: cursorInside } = useCursorFollow(containerRef)

  // Track 3D scene lifecycle so we can crossfade from blueprint to live scene
  const [splineReady, setSplineReady] = useState(false)

  const hasScene = typeof scene === 'string' && scene.startsWith('https://')
  // Blueprint is visible while loading or when no scene URL is configured
  const blueprintOpacity = hasScene && splineReady ? 0 : 1

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ width: '100%', height: '100vh', background: 'rgb(12 16 14)' }}
    >
      {/* Layer 1 — subtle emerald grid */}
      <div className="absolute inset-0 bg-grid" aria-hidden />

      {/* Layer 2a — Spline 3D scene, crossfades in over the blueprint once ready */}
      {hasScene && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: splineReady ? 1 : 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        >
          <Suspense fallback={null}>
            <Spline
              scene={scene!}
              onLoad={(app) => { setSplineReady(true); onLoad?.(app) }}
              className="absolute inset-0 w-full h-full"
              renderOnDemand={false}
            />
          </Suspense>
        </motion.div>
      )}

      {/* Layer 2b — animated architectural blueprint.
          Always mounted; fades out smoothly once the 3D scene is ready.
          Acts as the loading placeholder when a scene URL is configured. */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: blueprintOpacity }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      >
        <BlueprintBackground reduce={reduce} />
      </motion.div>

      {/* Layer 3 — cursor-follow ambient glow (interactive background element).
          Fades in when pointer enters and fades out when it leaves, so the glow
          never floats disconnected from the cursor — matching the Candidate 6
          two-layer depth model where the CSS glow leads and the Spline indicator trails. */}
      {!reduce && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full blur-3xl"
          style={{
            width: 700,
            height: 700,
            background:
              'radial-gradient(circle, rgba(34,197,94,0.11) 0%, transparent 70%)',
            left: `calc(${cursor.x}% - 350px)`,
            top: `calc(${cursor.y}% - 350px)`,
            opacity: cursorInside ? 1 : 0,
            transition: 'left 700ms ease-out, top 700ms ease-out, opacity 700ms ease-out',
          }}
        />
      )}

      {/* Layer 4 — vignette */}
      <div className="pointer-events-none absolute inset-0 vignette" aria-hidden />

      {/* Layer 5 — narrative content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 z-10">
        <HeroNarrative reduce={reduce} />
      </div>

      {/* Scroll cue */}
      <motion.div
        className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10"
        initial={reduce ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 1.5 }}
        aria-hidden
      >
        <span
          className="text-[10px] font-medium tracking-widest uppercase"
          style={{ color: 'rgba(235,244,238,0.25)' }}
        >
          Scroll
        </span>
        <span
          className="block h-5 w-px"
          style={{
            background: 'linear-gradient(to bottom, rgba(34,197,94,0.4), transparent)',
          }}
        />
      </motion.div>
    </div>
  )
}
