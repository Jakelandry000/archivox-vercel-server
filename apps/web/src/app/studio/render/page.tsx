'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { RenderUploadZone } from '@/components/RenderUploadZone'
import { RenderComparison } from '@/components/RenderComparison'

type Stage = 'upload' | 'prompt' | 'rendering' | 'done' | 'error'

export default function RenderStudioPage() {
  const [stage, setStage] = useState<Stage>('upload')
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('golden hour lighting, birch trees, modernist landscape')
  const [error, setError] = useState<string | null>(null)

  function onUploaded(url: string) {
    setOriginalUrl(url)
    setStage('prompt')
  }

  async function onRender() {
    if (!originalUrl) return
    setStage('rendering')
    setError(null)

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ originalUrl, prompt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Render failed')
      setRenderedUrl(json.renderedUrl)
      setStage('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Render failed')
      setStage('error')
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'rgb(var(--bg-rgb))', color: 'rgb(var(--text-rgb))', padding: '48px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ marginBottom: 40 }}
        >
          <p className="eyebrow" style={{ marginBottom: 16 }}>Studio · Render</p>
          <h1 className="display-md" style={{ marginBottom: 10 }}>Portfolio render</h1>
          <p style={{ color: 'rgb(var(--muted-rgb))', fontSize: 14, lineHeight: 1.6 }}>
            Upload a screenshot from Rhino, SketchUp, or any 3D software. AI adds materials,
            dusk lighting, and landscape context while preserving your geometry.
          </p>
        </motion.div>

        {stage === 'upload' && (
          <RenderUploadZone onUploaded={onUploaded} />
        )}

        {stage === 'prompt' && originalUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            <img
              src={originalUrl}
              alt="Uploaded screenshot"
              style={{ width: '100%', borderRadius: 14, objectFit: 'cover', maxHeight: 280, border: '1px solid var(--border)' }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="eyebrow">Rendering style</label>
              <textarea
                className="field"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. golden hour lighting, birch trees, modernist landscape"
                style={{ resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={onRender} className="btn btn-primary" style={{ fontSize: 14, padding: '12px 24px' }}>
                Generate render →
              </button>
              <button
                onClick={() => { setOriginalUrl(null); setStage('upload') }}
                className="btn btn-link"
                style={{ color: 'rgb(var(--muted-rgb))' }}
              >
                ← Re-upload
              </button>
            </div>
          </motion.div>
        )}

        {stage === 'rendering' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0' }}>
            <div style={{
              height: 32, width: 32, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.15)',
              borderTopColor: 'rgb(var(--text-rgb))',
              animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgb(var(--muted-rgb))' }}>
              Rendering via Flux Dev…
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgb(var(--muted-2-rgb))' }}>
              Usually 15–30 seconds
            </p>
          </div>
        )}

        {stage === 'done' && originalUrl && renderedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <RenderComparison originalUrl={originalUrl} renderedUrl={renderedUrl} />
            <div style={{ display: 'flex', gap: 12 }}>
              <a
                href={renderedUrl}
                download
                className="btn btn-primary"
                style={{ fontSize: 14, padding: '12px 24px' }}
              >
                ↓ Download render
              </a>
              <button
                onClick={() => { setOriginalUrl(null); setRenderedUrl(null); setStage('upload') }}
                className="btn btn-link"
                style={{ color: 'rgb(var(--muted-rgb))' }}
              >
                Render another →
              </button>
            </div>
          </motion.div>
        )}

        {stage === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>
            <button
              onClick={() => setStage('prompt')}
              className="btn btn-link"
              style={{ color: 'rgb(var(--muted-rgb))' }}
            >
              ← Try again
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  )
}
