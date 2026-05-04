'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  onUploaded: (url: string) => void
}

export function RenderUploadZone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      onUploaded(json.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [onUploaded])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  return (
    <motion.label
      className="relative flex flex-col items-center justify-center w-full min-h-[220px] rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
      style={{
        borderColor: dragging ? 'var(--accent-fg)' : 'var(--border-strong)',
        background: dragging ? 'rgba(79,154,120,0.06)' : 'rgba(255,255,255,0.02)',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      whileHover={{ borderColor: 'rgba(255,255,255,0.22)' }}
    >
      <input
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFileInput}
        disabled={uploading}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgb(var(--muted-rgb))' }}>
            Uploading…
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span style={{ fontSize: 32, color: 'rgb(var(--muted-2-rgb))' }}>↑</span>
          <p style={{ fontSize: 14, color: 'rgb(var(--muted-rgb))' }}>
            Drop a Rhino viewport screenshot here
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgb(var(--muted-2-rgb))' }}>
            PNG · JPG · WebP — section views, elevations, perspectives
          </p>
        </div>
      )}

      {error && (
        <p className="absolute bottom-3 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
      )}
    </motion.label>
  )
}
