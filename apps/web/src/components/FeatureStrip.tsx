'use client'

import { motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'

const FEATURES = [
  {
    title: '2D Floor Plans',
    body: 'SVG floor plans generated from constraint-driven room packing.',
  },
  {
    title: 'AutoCAD Scripts',
    body: 'Ready-to-run .scr files for every layout, no manual drafting.',
  },
  {
    title: 'Validation + IBC',
    body: 'Automatic overlap detection, coverage scoring, and code checks.',
  },
] as const


export function FeatureStrip() {
  const reduce = useReducedMotion()

  return (
    <main
      className="flex flex-col items-center px-6 py-16 border-t"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}
    >
      <motion.p
        className="text-xs font-semibold tracking-widest uppercase mb-10"
        style={{ color: 'rgba(34,197,94,0.6)' }}
        initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
      >
        What you get
      </motion.p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl w-full">
        {FEATURES.map(({ title, body }, i) => (
          <motion.div
            key={title}
            className="glass rounded-2xl p-5 text-left"
            initial={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.45, delay: i * 0.1, ease: 'easeOut' }
            }
          >
            <div
              className="text-sm font-semibold mb-1.5"
              style={{ color: 'rgba(235,244,238,0.9)' }}
            >
              {title}
            </div>
            <div
              className="text-xs leading-relaxed"
              style={{ color: 'rgba(235,244,238,0.55)' }}
            >
              {body}
            </div>
          </motion.div>
        ))}
      </div>
    </main>
  )
}
