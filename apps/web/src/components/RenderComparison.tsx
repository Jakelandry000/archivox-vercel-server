'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'

interface Props {
  originalUrl: string
  renderedUrl: string
}

export function RenderComparison({ originalUrl, renderedUrl }: Props) {
  const [sliderX, setSliderX] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = ((e.clientX - rect.left) / rect.width) * 100
    setSliderX(Math.min(95, Math.max(5, pct)))
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = ((e.touches[0].clientX - rect.left) / rect.width) * 100
    setSliderX(Math.min(95, Math.max(5, pct)))
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl overflow-hidden select-none"
      style={{ cursor: 'col-resize' }}
      onMouseMove={onMouseMove}
      onTouchMove={onTouchMove}
    >
      {/* Rendered — full width underneath */}
      <Image src={renderedUrl} alt="AI rendered" fill className="object-cover" sizes="100vw" />

      {/* Original — clipped to left of slider */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderX}%` }}>
        <Image src={originalUrl} alt="Original viewport" fill className="object-cover" sizes="100vw" />
      </div>

      {/* Divider */}
      <div
        className="absolute top-0 bottom-0 w-px"
        style={{
          left: `${sliderX}%`,
          background: 'rgba(255,255,255,0.8)',
          boxShadow: '0 0 8px rgba(255,255,255,0.6)',
        }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center"
          style={{ fontSize: 12, color: '#000' }}
        >
          ⇔
        </div>
      </div>

      {/* Labels */}
      <span
        className="absolute bottom-3 left-3 text-[10px] px-2 py-1 rounded"
        style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)' }}
      >
        ORIGINAL
      </span>
      <span
        className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded"
        style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)' }}
      >
        RENDERED
      </span>
    </div>
  )
}
