'use client'

/**
 * NarrativeSection — "From brief to blueprint in under a minute."
 *
 * Three scroll-triggered steps that narrate the ArchiVox workflow:
 *   01 Describe  — typewriter prompt animation
 *   02 Generate  — animated SVG floor plan drawing
 *   03 Export    — output file cards staggered in
 *
 * Motion rules (archivox-design-system.md / motion-patterns.md):
 *   - Framer Motion for all interactive animation
 *   - prefers-reduced-motion → animations disabled, content visible instantly
 *   - whileInView / useInView for scroll-triggered reveals (once: true)
 *   - Colors via CSS variables only — no Tailwind color classes
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

// ─── shared reduced-motion hook ────────────────────────────────────────────

function useReducedMotion() {
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

// ─── Step 1 illustration: typewriter prompt ─────────────────────────────────

const PROMPT_TEXT =
  '3-bedroom family home, open plan kitchen, south-facing garden, double garage'

function PromptIllustration({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [shown, setShown] = useState(reduce ? PROMPT_TEXT.length : 0)

  useEffect(() => {
    if (!inView) return
    if (reduce) { setShown(PROMPT_TEXT.length); return }
    let i = 0
    const id = setInterval(() => {
      i++
      setShown(i)
      if (i >= PROMPT_TEXT.length) clearInterval(id)
    }, 26)
    return () => clearInterval(id)
  }, [inView, reduce])

  return (
    <div
      ref={ref}
      className="glass rounded-2xl p-4 text-left font-mono text-xs h-full"
    >
      {/* Fake window chrome */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(248,113,113,0.5)' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(250,204,21,0.5)' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(34,197,94,0.5)' }} />
        <span
          className="ml-2 text-[10px]"
          style={{ color: 'rgba(235,244,238,0.3)' }}
        >
          ArchiVox prompt
        </span>
      </div>
      <div
        className="leading-relaxed min-h-[4rem]"
        style={{ color: 'rgba(34,197,94,0.85)' }}
      >
        <span style={{ color: 'rgba(235,244,238,0.35)' }}>{'> '}</span>
        {PROMPT_TEXT.slice(0, shown)}
        {shown < PROMPT_TEXT.length && !reduce && (
          <span
            className="inline-block w-px h-3 ml-0.5 align-middle"
            style={{
              background: 'rgb(var(--accent))',
              animation: 'pulse 1s step-end infinite',
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Step 2 illustration: animated SVG floor plan ────────────────────────────

function FloorPlanIllustration({ reduce }: { reduce: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' })

  function wall(delay: number) {
    return {
      initial: { pathLength: 0, opacity: reduce ? 1 : 0 },
      animate: inView ? { pathLength: 1, opacity: 1 } : {},
      transition:
        reduce
          ? { duration: 0 }
          : { pathLength: { duration: 0.7, delay, ease: 'easeOut' }, opacity: { duration: 0.2, delay } },
    }
  }

  function label(delay: number) {
    return {
      initial: { opacity: reduce ? 1 : 0 },
      animate: inView ? { opacity: 1 } : {},
      transition: reduce ? { duration: 0 } : { duration: 0.3, delay },
    }
  }

  return (
    <svg
      ref={ref}
      viewBox="0 0 200 140"
      className="w-full max-w-[220px] mx-auto"
      aria-label="Animated floor plan illustration"
    >
      {/* Outer shell */}
      <motion.rect
        x="8" y="8" width="184" height="124"
        fill="none"
        stroke="rgba(34,197,94,0.65)"
        strokeWidth="2"
        {...wall(0.1)}
      />
      {/* Horizontal wall — splits living from bedroom zone */}
      <motion.line
        x1="8" y1="72" x2="124" y2="72"
        stroke="rgba(34,197,94,0.4)" strokeWidth="1.5"
        {...wall(0.8)}
      />
      {/* Vertical wall — splits living from kitchen */}
      <motion.line
        x1="124" y1="8" x2="124" y2="132"
        stroke="rgba(34,197,94,0.4)" strokeWidth="1.5"
        {...wall(1.0)}
      />
      {/* Horizontal wall — splits bed1 from bed2 */}
      <motion.line
        x1="8" y1="100" x2="124" y2="100"
        stroke="rgba(34,197,94,0.4)" strokeWidth="1.5"
        {...wall(1.2)}
      />
      {/* Door arc — living to bedroom hall */}
      <motion.path
        d="M 8 72 A 28 28 0 0 1 36 100"
        fill="none"
        stroke="rgba(34,197,94,0.35)"
        strokeWidth="1"
        strokeDasharray="3 3"
        {...wall(1.5)}
      />

      {/* Room labels */}
      {([
        { x: 66, y: 44, text: 'Living' },
        { x: 160, y: 70, text: 'Kitchen' },
        { x: 62, y: 90, text: 'Bed 1' },
        { x: 62, y: 120, text: 'Bed 2' },
      ] as const).map(({ x, y, text }) => (
        <motion.text
          key={text}
          x={x} y={y}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="9"
          fill="rgba(34,197,94,0.5)"
          {...label(1.8)}
        >
          {text}
        </motion.text>
      ))}

      {/* Compass indicator */}
      <motion.g {...label(2.1)}>
        <line x1="184" y1="24" x2="184" y2="14" stroke="rgba(34,197,94,0.7)" strokeWidth="1.5" />
        <polygon points="184,12 181,18 187,18" fill="rgba(34,197,94,0.7)" />
        <text x="184" y="10" textAnchor="middle" fontFamily="monospace" fontSize="7"
          fill="rgba(34,197,94,0.7)">N</text>
      </motion.g>
    </svg>
  )
}

// ─── Step 3 illustration: export file cards ─────────────────────────────────

const EXPORT_FILES = [
  { label: 'floor_plan.svg', desc: 'Vector floor plan', color: 'rgb(var(--accent))' },
  { label: 'drawing.scr',    desc: 'AutoCAD script',    color: 'rgb(var(--accent-2))' },
  { label: 'report.pdf',     desc: 'IBC validation',    color: 'rgba(160,176,168,0.8)' },
] as const

function ExportIllustration({ reduce }: { reduce: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-80px' })

  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      {EXPORT_FILES.map(({ label, desc, color }, i) => (
        <motion.div
          key={label}
          className="glass rounded-xl px-3 py-2.5 flex items-center gap-2.5"
          initial={{ opacity: reduce ? 1 : 0, x: reduce ? 0 : 14 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.35, delay: i * 0.13, ease: 'easeOut' }
          }
        >
          {/* File-type colour strip */}
          <span
            className="h-7 w-1 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <span className="flex flex-col">
            <span className="text-[11px] font-mono" style={{ color: 'rgba(235,244,238,0.8)' }}>
              {label}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(235,244,238,0.4)' }}>
              {desc}
            </span>
          </span>
          <span
            className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(34,197,94,0.12)',
              color: 'rgb(var(--accent))',
            }}
          >
            Ready
          </span>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  {
    num: '01',
    title: 'Describe',
    body: 'Write a brief in plain English — room count, style, site constraints. No CAD knowledge required.',
    Visual: PromptIllustration,
  },
  {
    num: '02',
    title: 'Generate',
    body: 'ArchiVox resolves room adjacency, sizes, and code constraints, then draws the floor plan.',
    Visual: FloorPlanIllustration,
  },
  {
    num: '03',
    title: 'Export',
    body: 'Download SVG, AutoCAD script, and a full IBC validation report in seconds.',
    Visual: ExportIllustration,
  },
] as const

// ─── Section ─────────────────────────────────────────────────────────────────

export function NarrativeSection() {
  const reduce = useReducedMotion()

  return (
    <section className="relative px-6 py-28">
      {/* Heading */}
      <motion.div
        className="mb-16 text-center"
        initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
      >
        <div
          className="inline-block text-xs font-semibold tracking-widest uppercase mb-4"
          style={{ color: 'rgba(34,197,94,0.65)' }}
        >
          How it works
        </div>
        <h2 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          From brief to blueprint
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))',
            }}
          >
            in under a minute.
          </span>
        </h2>
      </motion.div>

      {/* Steps */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 gap-10 sm:grid-cols-3">
        {STEPS.map(({ num, title, body, Visual }, i) => (
          <motion.div
            key={num}
            className="flex flex-col gap-5"
            initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.45, delay: i * 0.1, ease: 'easeOut' }
            }
          >
            {/* Illustration card */}
            <div className="glass rounded-2xl p-5 flex-1 flex items-center justify-center min-h-[180px]">
              <Visual reduce={reduce} />
            </div>

            {/* Text */}
            <div>
              <div
                className="text-xs font-mono mb-1"
                style={{ color: 'rgba(34,197,94,0.55)' }}
              >
                {num}
              </div>
              <div
                className="text-base font-semibold mb-1.5"
                style={{ color: 'rgba(235,244,238,0.9)' }}
              >
                {title}
              </div>
              <div
                className="text-sm leading-relaxed"
                style={{ color: 'rgba(235,244,238,0.55)' }}
              >
                {body}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
