'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true when the user's OS/browser has requested reduced motion.
 * Reactive — updates if the preference changes while the component is mounted.
 */
export function useReducedMotion(): boolean {
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
