'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Animated hero overlay — badge, headline, subtitle, and CTA buttons.
 *
 * Staggered entrance on mount respects prefers-reduced-motion:
 *   reduced  → all elements visible immediately (no transforms)
 *   default  → each element fades up in sequence (0.2 s cadence)
 *
 * Design system:
 *   Colors via CSS variables (rgb(var(--accent)), etc.) — no Tailwind color classes.
 *   Typography follows the h1 scale defined in archivox-design-system.md.
 */
export function HeroContent() {
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduce(!!mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

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
    <div className="max-w-3xl text-center">
      {/* Badge */}
      <motion.div
        {...fadeUp(0.15)}
        className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style={{
          borderColor: 'rgba(34,197,94,0.2)',
          background: 'rgba(34,197,94,0.1)',
          color: 'rgb(var(--accent))',
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: 'rgb(var(--accent))' }}
        />
        Early access
      </motion.div>

      {/* Headline */}
      <motion.h1
        {...fadeUp(0.35)}
        className="font-display font-black uppercase tracking-tight"
        style={{ fontSize: 'clamp(3.5rem, 10vw, 7rem)', lineHeight: 0.95 }}
      >
        Architectural{' '}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))',
          }}
        >
          layouts
        </span>
        <br />
        from plain language.
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        {...fadeUp(0.55)}
        className="mt-8 text-lg leading-relaxed max-w-xl mx-auto"
        style={{ color: 'rgba(235,244,238,0.6)' }}
      >
        Describe a home in plain English. ArchiVox generates a 2D floor plan,
        AutoCAD script, and a full validation report — instantly.
      </motion.p>

      {/* CTAs */}
      <motion.div
        {...fadeUp(0.72)}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
      >
        <Link href="/signin" className="btn btn-primary px-8 py-3 text-base">
          Get started
        </Link>
        <Link
          href="/generator"
          className="btn btn-ghost px-8 py-3 text-base"
          style={{ color: 'rgba(235,244,238,0.8)' }}
        >
          Try demo ↗
        </Link>
      </motion.div>
    </div>
  )
}
