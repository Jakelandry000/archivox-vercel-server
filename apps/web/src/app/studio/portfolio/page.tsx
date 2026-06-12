'use client'

import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RenderedPortfolioView } from '@/app/api/portfolio/route'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ViewSlot {
  id: string
  label: string
  originalUrl: string | null
  renderedUrl: string | null
  error?: string
}

interface Metadata {
  projectName: string
  architect: string
  location: string
  year: string
}

type Stage = 'setup' | 'rendering' | 'preview'

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_SLOTS: ViewSlot[] = [
  { id: 'floor-plan',    label: 'Floor Plan',    originalUrl: null, renderedUrl: null },
  { id: 'elevation-n',   label: 'Elevation N',   originalUrl: null, renderedUrl: null },
  { id: 'elevation-e',   label: 'Elevation E',   originalUrl: null, renderedUrl: null },
  { id: 'section-aa',    label: 'Section A–A',   originalUrl: null, renderedUrl: null },
  { id: 'section-bb',    label: 'Section B–B',   originalUrl: null, renderedUrl: null },
  { id: 'perspective',   label: 'Perspective',   originalUrl: null, renderedUrl: null },
]

// ── Upload helper ─────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Upload failed')
  return json.url as string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ViewSlotCell({
  slot,
  onFileSelected,
  uploading,
}: {
  slot: ViewSlot
  onFileSelected: (id: string, file: File) => void
  uploading: boolean
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (file: File) => onFileSelected(slot.id, file)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgb(var(--muted-2-rgb))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {slot.label}
      </span>

      <label
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          aspectRatio: '16/10',
          borderRadius: 10,
          border: `1.5px dashed ${dragging ? 'var(--accent-fg)' : slot.originalUrl ? 'var(--border)' : 'var(--border-strong)'}`,
          background: dragging ? 'rgba(79,154,120,0.06)' : slot.originalUrl ? 'transparent' : 'rgba(255,255,255,0.015)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          overflow: 'hidden',
          transition: 'border-color 0.15s',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handle(file)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handle(file)
            e.target.value = ''
          }}
        />

        {slot.originalUrl ? (
          <>
            <img
              src={slot.originalUrl}
              alt={slot.label}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
            >
              <span style={{ fontSize: 11, color: 'white', fontFamily: 'var(--font-mono)' }}>Replace</span>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 22, color: 'rgb(var(--muted-2-rgb))' }}>+</span>
        )}
      </label>
    </div>
  )
}

// ── Portfolio preview (also renders to PDF via window.print()) ────────────────

function PortfolioPreview({
  slots,
  metadata,
  onReset,
}: {
  slots: ViewSlot[]
  metadata: Metadata
  onReset: () => void
}) {
  const rendered = slots.filter(s => s.renderedUrl)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      {/* Action bar — hidden when printing */}
      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 32, alignItems: 'center' }}>
        <button
          onClick={() => window.print()}
          className="btn btn-primary"
          style={{ fontSize: 14, padding: '12px 24px' }}
        >
          ↓ Export PDF
        </button>
        <button
          onClick={onReset}
          className="btn btn-link"
          style={{ color: 'rgb(var(--muted-rgb))' }}
        >
          ← New portfolio
        </button>
      </div>

      {/* Portfolio sheet */}
      <div
        id="portfolio-sheet"
        style={{
          background: 'white',
          color: '#111',
          padding: '40px 48px 48px',
          borderRadius: 12,
          boxShadow: '0 4px 40px rgba(0,0,0,0.35)',
          maxWidth: 960,
          margin: '0 auto',
          fontFamily: 'var(--font-sans, sans-serif)',
        }}
      >
        {/* Title block */}
        <div style={{ borderBottom: '1.5px solid #111', paddingBottom: 20, marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>
              Architectural Portfolio
            </p>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              {metadata.projectName || 'Untitled Project'}
            </h1>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#555', lineHeight: 1.8 }}>
            {metadata.architect && <div>{metadata.architect}</div>}
            {metadata.location && <div>{metadata.location}</div>}
            {metadata.year && <div>{metadata.year}</div>}
          </div>
        </div>

        {/* View grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: rendered.length === 1 ? '1fr' : rendered.length <= 2 ? '1fr 1fr' : 'repeat(2, 1fr)',
          gap: 20,
        }}>
          {rendered.map(slot => (
            <div key={slot.id}>
              <img
                src={slot.renderedUrl!}
                alt={slot.label}
                style={{ width: '100%', display: 'block', borderRadius: 4, border: '1px solid #e5e7eb' }}
              />
              <p style={{ marginTop: 8, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace' }}>
                {slot.label}
              </p>
              {slot.error && (
                <p style={{ marginTop: 4, fontSize: 11, color: '#dc2626' }}>Render failed</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [stage, setStage] = useState<Stage>('setup')
  const [slots, setSlots] = useState<ViewSlot[]>(INITIAL_SLOTS)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [stylePrompt, setStylePrompt] = useState('golden hour lighting, birch trees, modernist landscape')
  const [metadata, setMetadata] = useState<Metadata>({ projectName: '', architect: '', location: '', year: '' })
  const [renderProgress, setRenderProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  const uploadedCount = slots.filter(s => s.originalUrl).length

  const handleFileSelected = useCallback(async (id: string, file: File) => {
    setUploadingId(id)
    try {
      const url = await uploadFile(file)
      setSlots(prev => prev.map(s => s.id === id ? { ...s, originalUrl: url, renderedUrl: null } : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingId(null)
    }
  }, [])

  async function handleGenerate() {
    const toRender = slots.filter(s => s.originalUrl)
    if (toRender.length === 0) return

    setStage('rendering')
    setError(null)
    setRenderProgress(`Rendering ${toRender.length} view${toRender.length > 1 ? 's' : ''}…`)

    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          views: toRender.map(s => ({ id: s.id, viewType: s.label, originalUrl: s.originalUrl })),
          prompt: stylePrompt,
        }),
      })

      const json = await res.json()
      if (!res.ok && !json.views) throw new Error(json.error ?? 'Portfolio render failed')

      const renderedMap = new Map<string, RenderedPortfolioView>(
        (json.views as RenderedPortfolioView[]).map(v => [v.id, v])
      )

      setSlots(prev => prev.map(s => {
        const rv = renderedMap.get(s.id)
        if (!rv) return s
        return { ...s, renderedUrl: rv.renderedUrl || null, error: rv.error }
      }))

      setStage('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Render failed')
      setStage('setup')
    }
  }

  function handleReset() {
    setSlots(INITIAL_SLOTS)
    setStage('setup')
    setError(null)
    setRenderProgress('')
  }

  return (
    <main style={{ minHeight: '100vh', background: 'rgb(var(--bg-rgb))', color: 'rgb(var(--text-rgb))', padding: '48px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ marginBottom: 40 }}
        >
          <p className="eyebrow no-print" style={{ marginBottom: 16 }}>Studio · Portfolio</p>
          <h1 className="display-md no-print" style={{ marginBottom: 10 }}>Portfolio generator</h1>
          {stage === 'setup' && (
            <p style={{ color: 'rgb(var(--muted-rgb))', fontSize: 14, lineHeight: 1.6 }} className="no-print">
              Upload screenshots from any 3D software for each view. AI adds dusk lighting, materials,
              and landscape context — then you download a portfolio-ready PPTX and PNG set.
            </p>
          )}
        </motion.div>

        <AnimatePresence mode="wait">

          {stage === 'setup' && (
            <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Two-column layout: metadata left, slots right */}
              <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 40, marginBottom: 32 }}>

                {/* Metadata form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted-rgb))', margin: 0 }}>
                    Project info
                  </h2>
                  {([
                    { key: 'projectName', label: 'Project name', placeholder: 'Hillside Residence' },
                    { key: 'architect',   label: 'Architect',    placeholder: 'Studio Name' },
                    { key: 'location',    label: 'Location',     placeholder: 'Portland, OR' },
                    { key: 'year',        label: 'Year',         placeholder: '2025' },
                  ] as const).map(({ key, label, placeholder }) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label className="eyebrow" style={{ fontSize: 11 }}>{label}</label>
                      <input
                        className="field"
                        value={metadata[key]}
                        onChange={e => setMetadata(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ fontSize: 13 }}
                      />
                    </div>
                  ))}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    <label className="eyebrow" style={{ fontSize: 11 }}>Rendering style</label>
                    <textarea
                      className="field"
                      rows={3}
                      value={stylePrompt}
                      onChange={e => setStylePrompt(e.target.value)}
                      placeholder="golden hour lighting, birch trees…"
                      style={{ resize: 'none', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* View slots grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h2 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted-rgb))', margin: 0 }}>
                    Views <span style={{ color: 'rgb(var(--muted-2-rgb))', fontWeight: 400 }}>({uploadedCount} uploaded)</span>
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {slots.map(slot => (
                      <ViewSlotCell
                        key={slot.id}
                        slot={slot}
                        onFileSelected={handleFileSelected}
                        uploading={uploadingId === slot.id}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</p>
              )}

              <button
                onClick={handleGenerate}
                disabled={uploadedCount === 0 || uploadingId !== null}
                className="btn btn-primary"
                style={{ fontSize: 14, padding: '14px 32px', opacity: uploadedCount === 0 ? 0.4 : 1 }}
              >
                Generate portfolio →
              </button>

            </motion.div>
          )}

          {stage === 'rendering' && (
            <motion.div
              key="rendering"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '100px 0' }}
            >
              <div style={{
                height: 36, width: 36, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.12)',
                borderTopColor: 'rgb(var(--text-rgb))',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgb(var(--muted-rgb))' }}>
                {renderProgress}
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgb(var(--muted-2-rgb))' }}>
                Each view takes 15–30 seconds
              </p>
            </motion.div>
          )}

          {stage === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <PortfolioPreview slots={slots} metadata={metadata} onReset={handleReset} />
            </motion.div>
          )}

        </AnimatePresence>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          main { background: white !important; padding: 0 !important; }
          #portfolio-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            padding: 24px !important;
          }
        }
      `}</style>
    </main>
  )
}
