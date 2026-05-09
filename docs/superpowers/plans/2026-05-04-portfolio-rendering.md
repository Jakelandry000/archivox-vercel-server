# Portfolio Rendering Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let architects upload a Rhino viewport screenshot (PNG/JPG), send it to Google Imagen 3 with a rendering prompt, and get back a photorealistic portfolio image — preserving exact geometry while adding materials, lighting, and landscape context.

**Architecture:** A Next.js API route accepts a multipart file upload, stores the original to Vercel Blob, calls Imagen 3 image-editing endpoint, stores the rendered result, and returns both URLs. A new `/studio/render` page provides the upload UI and before/after comparison. Renders are tracked in a new Prisma `Render` table linked to projects.

**Tech Stack:** Next.js 16, TypeScript, Vercel Blob (`@vercel/blob`), Google Vertex AI Imagen 3 (`@google-cloud/aiplatform`), Prisma + PostgreSQL (existing), Tailwind + Framer Motion (existing)

---

## File Map

```
apps/web/src/
├── app/
│   ├── api/
│   │   ├── upload/route.ts              # POST: accepts image, stores to Vercel Blob, returns URL
│   │   └── render/route.ts              # POST: { blobUrl, prompt } → Imagen 3 → rendered URL
│   └── studio/
│       └── render/
│           └── page.tsx                 # /studio/render — upload + render UI page
├── components/
│   ├── RenderUploadZone.tsx             # Drag-drop / click-to-upload component
│   └── RenderComparison.tsx             # Side-by-side before/after slider
└── lib/
    └── imagen.ts                        # Vertex AI Imagen 3 wrapper

packages/db/
├── prisma/schema.prisma                 # Add Render model (modify existing)
└── src/renders.ts                       # createRender, getRendersByProject CRUD
```

---

## Prerequisites

1. **Vercel Blob** — run `npm install @vercel/blob` in `apps/web`. In Vercel dashboard: Storage → Create Blob store → copy `BLOB_READ_WRITE_TOKEN` to `.env.local`
2. **Google Cloud project** with Vertex AI API enabled. Create a service account with `Vertex AI User` role, download the JSON key, set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` in `.env.local`
3. Set `GOOGLE_CLOUD_PROJECT=your-project-id` in `.env.local`
4. Install: `npm install @google-cloud/aiplatform` in `apps/web`

---

## Task 1: Database — Render Model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/renders.ts`

- [ ] **Step 1: Add Render model to schema**

Open `packages/db/prisma/schema.prisma` and add after the existing models:

```prisma
model Render {
  id          String   @id @default(cuid())
  projectId   String?
  originalUrl String
  renderedUrl String?
  prompt      String
  status      String   @default("pending") // pending | complete | failed
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 2: Run migration**

```bash
cd packages/db
npx prisma migrate dev --name add_render_model
```

Expected output: `✔ Your database is now in sync with your schema.`

- [ ] **Step 3: Write failing tests for render CRUD**

Create `packages/db/src/renders.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { createRender, getRendersByProject, updateRender } from './renders'

const prisma = new PrismaClient()

beforeEach(async () => {
  await prisma.render.deleteMany()
})

describe('createRender', () => {
  it('creates a render record with pending status', async () => {
    const render = await createRender({
      originalUrl: 'https://blob.vercel-storage.com/test.png',
      prompt: 'photorealistic architecture rendering with trees',
      projectId: null,
    })

    expect(render.id).toBeDefined()
    expect(render.status).toBe('pending')
    expect(render.renderedUrl).toBeNull()
  })
})

describe('updateRender', () => {
  it('updates status and renderedUrl', async () => {
    const render = await createRender({
      originalUrl: 'https://blob.vercel-storage.com/test.png',
      prompt: 'test prompt',
      projectId: null,
    })

    const updated = await updateRender(render.id, {
      status: 'complete',
      renderedUrl: 'https://blob.vercel-storage.com/rendered.png',
    })

    expect(updated.status).toBe('complete')
    expect(updated.renderedUrl).toBe('https://blob.vercel-storage.com/rendered.png')
  })
})

describe('getRendersByProject', () => {
  it('returns renders filtered by projectId', async () => {
    await createRender({ originalUrl: 'https://a.com/1.png', prompt: 'p', projectId: 'proj-1' })
    await createRender({ originalUrl: 'https://a.com/2.png', prompt: 'p', projectId: 'proj-2' })

    const results = await getRendersByProject('proj-1')

    expect(results).toHaveLength(1)
    expect(results[0].projectId).toBe('proj-1')
  })
})
```

- [ ] **Step 4: Run to confirm failure**

```bash
cd packages/db
npx vitest run src/renders.test.ts
```

Expected: FAIL — `createRender` not defined

- [ ] **Step 5: Implement renders.ts**

Create `packages/db/src/renders.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CreateRenderInput {
  originalUrl: string
  prompt: string
  projectId: string | null
}

export async function createRender(input: CreateRenderInput) {
  return prisma.render.create({ data: input })
}

export async function updateRender(
  id: string,
  data: { status: string; renderedUrl?: string }
) {
  return prisma.render.update({ where: { id }, data })
}

export async function getRendersByProject(projectId: string) {
  return prisma.render.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
}
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
npx vitest run src/renders.test.ts
```

Expected: PASS — 3 tests passing

- [ ] **Step 7: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/src/renders.ts packages/db/src/renders.test.ts
git commit -m "feat: add Render model and CRUD helpers"
```

---

## Task 2: Imagen 3 Client

**Files:**
- Create: `apps/web/src/lib/imagen.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/lib/imagen.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderImage } from './imagen'

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: vi.fn().mockImplementation(() => ({
    predict: vi.fn().mockResolvedValue([
      {
        predictions: [
          {
            bytesBase64Encoded: Buffer.from('fake-image-bytes').toString('base64'),
          },
        ],
      },
    ]),
  })),
}))

describe('renderImage', () => {
  it('returns a base64 string from Imagen API response', async () => {
    const result = await renderImage({
      imageBase64: Buffer.from('input-image').toString('base64'),
      prompt: 'photorealistic rendering with trees',
      projectId: 'test-project',
    })

    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/web
npx vitest run src/lib/imagen.test.ts
```

Expected: FAIL — `renderImage` not defined

- [ ] **Step 3: Implement imagen.ts**

Create `apps/web/src/lib/imagen.ts`:

```typescript
import { PredictionServiceClient } from '@google-cloud/aiplatform'

interface RenderImageInput {
  imageBase64: string
  prompt: string
  projectId: string
}

const LOCATION = 'us-central1'
const PUBLISHER = 'google'
const MODEL = 'imagen-3.0-edit-001'

const ARCHITECTURE_SUFFIX = [
  'photorealistic architectural rendering',
  'professional portfolio quality',
  'add trees, grass, landscape context',
  'natural lighting, golden hour',
  'preserve all geometry and structural elements exactly',
  'high resolution, sharp details',
].join(', ')

export async function renderImage(input: RenderImageInput): Promise<string> {
  const client = new PredictionServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  })

  const endpoint = `projects/${input.projectId}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`

  const fullPrompt = `${input.prompt}, ${ARCHITECTURE_SUFFIX}`

  const [response] = await client.predict({
    endpoint,
    instances: [
      {
        structValue: {
          fields: {
            prompt: { stringValue: fullPrompt },
            referenceImages: {
              listValue: {
                values: [
                  {
                    structValue: {
                      fields: {
                        referenceType: { stringValue: 'REFERENCE_TYPE_STYLE' },
                        referenceImage: {
                          structValue: {
                            fields: {
                              bytesBase64Encoded: { stringValue: input.imageBase64 },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    parameters: {
      structValue: {
        fields: {
          sampleCount: { numberValue: 1 },
          aspectRatio: { stringValue: '16:9' },
        },
      },
    },
  })

  const base64 = (response.predictions?.[0] as any)?.bytesBase64Encoded
  if (!base64) throw new Error('Imagen returned no image data')

  return base64 as string
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run src/lib/imagen.test.ts
```

Expected: PASS — 1 test passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/imagen.ts apps/web/src/lib/imagen.test.ts
git commit -m "feat: Imagen 3 client wrapper for architectural rendering"
```

---

## Task 3: Upload API Route

**Files:**
- Create: `apps/web/src/app/api/upload/route.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/app/api/upload/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from './route'

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://blob.vercel-storage.com/test-abc123.png' }),
}))

describe('POST /api/upload', () => {
  it('returns a blob URL on successful upload', async () => {
    const file = new File(['fake image bytes'], 'section-view.png', { type: 'image/png' })
    const formData = new FormData()
    formData.append('file', file)

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.url).toMatch(/blob\.vercel-storage\.com/)
  })

  it('returns 400 when no file is provided', async () => {
    const formData = new FormData()
    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/app/api/upload/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement upload route**

Create `apps/web/src/app/api/upload/route.ts`:

```typescript
import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const allowed = ['image/png', 'image/jpeg', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'File must be PNG, JPEG, or WebP' }, { status: 400 })
  }

  const blob = await put(`renders/${Date.now()}-${file.name}`, file, {
    access: 'public',
  })

  return NextResponse.json({ url: blob.url })
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run src/app/api/upload/route.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/upload/
git commit -m "feat: file upload API route to Vercel Blob"
```

---

## Task 4: Render API Route

**Files:**
- Create: `apps/web/src/app/api/render/route.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/src/app/api/render/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/imagen', () => ({
  renderImage: vi.fn().mockResolvedValue('base64renderedimagedata'),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://blob.vercel-storage.com/rendered-abc.png' }),
}))

vi.mock('@archivox/db/renders', () => ({
  createRender: vi.fn().mockResolvedValue({ id: 'render-1', status: 'pending' }),
  updateRender: vi.fn().mockResolvedValue({ id: 'render-1', status: 'complete' }),
}))

describe('POST /api/render', () => {
  it('returns originalUrl and renderedUrl on success', async () => {
    const body = {
      originalUrl: 'https://blob.vercel-storage.com/original.png',
      prompt: 'golden hour lighting with birch trees',
      projectId: null,
    }

    const request = new Request('http://localhost/api/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.originalUrl).toBe(body.originalUrl)
    expect(json.renderedUrl).toMatch(/blob\.vercel-storage\.com/)
    expect(json.renderId).toBeDefined()
  })

  it('returns 400 when originalUrl is missing', async () => {
    const request = new Request('http://localhost/api/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/app/api/render/route.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement render route**

Create `apps/web/src/app/api/render/route.ts`:

```typescript
import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { renderImage } from '@/lib/imagen'
import { createRender, updateRender } from '@archivox/db/renders'

export async function POST(request: Request) {
  const body = await request.json()
  const { originalUrl, prompt, projectId } = body

  if (!originalUrl) {
    return NextResponse.json({ error: 'originalUrl is required' }, { status: 400 })
  }

  const renderRecord = await createRender({
    originalUrl,
    prompt: prompt ?? 'photorealistic architectural rendering',
    projectId: projectId ?? null,
  })

  try {
    // Fetch the original image and convert to base64 for Imagen
    const imageResponse = await fetch(originalUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBase64 = Buffer.from(imageBuffer).toString('base64')

    const renderedBase64 = await renderImage({
      imageBase64,
      prompt: prompt ?? 'photorealistic architectural rendering with landscape context',
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
    })

    // Store rendered image to Vercel Blob
    const renderedBuffer = Buffer.from(renderedBase64, 'base64')
    const renderedBlob = await put(
      `renders/rendered-${Date.now()}.png`,
      renderedBuffer,
      { access: 'public', contentType: 'image/png' }
    )

    await updateRender(renderRecord.id, {
      status: 'complete',
      renderedUrl: renderedBlob.url,
    })

    return NextResponse.json({
      renderId: renderRecord.id,
      originalUrl,
      renderedUrl: renderedBlob.url,
    })
  } catch (error) {
    await updateRender(renderRecord.id, { status: 'failed' })
    const message = error instanceof Error ? error.message : 'Render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
npx vitest run src/app/api/render/route.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/render/
git commit -m "feat: render API route — upload to Imagen 3, store result to Blob"
```

---

## Task 5: Upload Zone Component

**Files:**
- Create: `apps/web/src/components/RenderUploadZone.tsx`

- [ ] **Step 1: Create RenderUploadZone.tsx**

```tsx
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
        borderColor: dragging ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.12)',
        background: dragging ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
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
          <p className="text-xs text-white/50 font-mono">Uploading…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <span className="text-3xl text-white/20">↑</span>
          <p className="text-sm text-white/60">
            Drop a Rhino viewport screenshot here
          </p>
          <p className="text-xs text-white/30 font-mono">
            PNG · JPG · WebP — section views, elevations, perspectives
          </p>
        </div>
      )}

      {error && (
        <p className="absolute bottom-3 text-xs text-red-400">{error}</p>
      )}
    </motion.label>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors on `RenderUploadZone.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/RenderUploadZone.tsx
git commit -m "feat: drag-drop upload zone component"
```

---

## Task 6: Render Comparison Component

**Files:**
- Create: `apps/web/src/components/RenderComparison.tsx`

- [ ] **Step 1: Create RenderComparison.tsx**

```tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl overflow-hidden cursor-col-resize select-none"
      onMouseMove={onMouseMove}
    >
      {/* Rendered image — full width underneath */}
      <Image
        src={renderedUrl}
        alt="AI rendered"
        fill
        className="object-cover"
        sizes="100vw"
      />

      {/* Original image — clipped to left of slider */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderX}%` }}
      >
        <Image
          src={originalUrl}
          alt="Original viewport"
          fill
          className="object-cover"
          sizes="100vw"
        />
      </div>

      {/* Slider line */}
      <motion.div
        className="absolute top-0 bottom-0 w-px bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.6)]"
        style={{ left: `${sliderX}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <span className="text-black text-xs select-none">⇔</span>
        </div>
      </motion.div>

      {/* Labels */}
      <span className="absolute bottom-3 left-3 text-[10px] font-mono text-white/60 bg-black/40 px-2 py-1 rounded">
        ORIGINAL
      </span>
      <span className="absolute bottom-3 right-3 text-[10px] font-mono text-white/60 bg-black/40 px-2 py-1 rounded">
        RENDERED
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/RenderComparison.tsx
git commit -m "feat: before/after render comparison slider component"
```

---

## Task 7: Render Studio Page

**Files:**
- Create: `apps/web/src/app/studio/render/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
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
    <main className="min-h-screen bg-[#080808] text-white px-6 py-12">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-10"
        >
          <p className="text-xs font-mono text-white/30 tracking-widest mb-2">
            STUDIO · RENDER
          </p>
          <h1 className="text-4xl font-bold tracking-tight">Portfolio render.</h1>
          <p className="mt-2 text-white/50 text-sm">
            Upload a Rhino viewport screenshot. AI adds materials, lighting, and landscape — geometry preserved exactly.
          </p>
        </motion.div>

        {/* Stage: upload */}
        {(stage === 'upload') && (
          <RenderUploadZone onUploaded={onUploaded} />
        )}

        {/* Stage: prompt */}
        {stage === 'prompt' && originalUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-5"
          >
            <img
              src={originalUrl}
              alt="Uploaded section view"
              className="w-full rounded-2xl object-cover max-h-64"
            />

            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-white/40 tracking-widest">
                RENDERING STYLE
              </label>
              <textarea
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-white/20 resize-none"
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. golden hour lighting, birch trees, modernist landscape"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={onRender}
                className="bg-[#1B3A2D] hover:bg-[#234d3b] text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                Generate render →
              </button>
              <button
                onClick={() => { setOriginalUrl(null); setStage('upload') }}
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                ← Re-upload
              </button>
            </div>
          </motion.div>
        )}

        {/* Stage: rendering */}
        {stage === 'rendering' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <p className="text-white/50 text-sm font-mono">Rendering via Imagen 3…</p>
            <p className="text-white/25 text-xs">Usually 15–30 seconds</p>
          </div>
        )}

        {/* Stage: done */}
        {stage === 'done' && originalUrl && renderedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-6"
          >
            <RenderComparison originalUrl={originalUrl} renderedUrl={renderedUrl} />

            <div className="flex gap-3">
              <a
                href={renderedUrl}
                download
                className="bg-[#1B3A2D] hover:bg-[#234d3b] text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                ↓ Download render
              </a>
              <button
                onClick={() => { setOriginalUrl(null); setRenderedUrl(null); setStage('upload') }}
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Render another →
              </button>
            </div>
          </motion.div>
        )}

        {/* Stage: error */}
        {stage === 'error' && (
          <div className="flex flex-col gap-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setStage('prompt')}
              className="text-white/40 hover:text-white/70 text-sm"
            >
              ← Try again
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit
```

Expected: no type errors

- [ ] **Step 3: Start dev server and test the full flow manually**

```bash
npm run dev
```

Navigate to `http://localhost:3000/studio/render`

Test flow:
1. Drop a PNG file into the upload zone — verify it uploads and shows the preview
2. Edit the render prompt — verify the textarea is editable
3. Click "Generate render" — verify the spinner appears
4. Verify the comparison slider appears when done and is draggable

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/studio/render/
git commit -m "feat: render studio page — upload, prompt, render, before/after comparison"
```

---

## Task 8: Wire Render Studio into Navigation

**Files:**
- Modify: whichever file contains the main nav (check `apps/web/src/app/layout.tsx` or the nav component)

- [ ] **Step 1: Find the nav component**

```bash
grep -r "Studio" apps/web/src --include="*.tsx" -l
```

- [ ] **Step 2: Add Render link to Studio nav**

In the nav component, add a link to `/studio/render`:

```tsx
<Link href="/studio/render" className="...existing nav link styles...">
  Render
</Link>
```

- [ ] **Step 3: Verify it appears in the browser nav**

```bash
npm run dev
```

Navigate to `http://localhost:3000` — confirm "Render" appears in the Studio nav section.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/
git commit -m "feat: add Render link to Studio navigation"
```

---

## Environment Variables Summary

Add all of these to `.env.local` before testing end-to-end:

```bash
# Vercel Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx

# Google Vertex AI (Imagen 3)
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
```

For production deployment on Vercel, add these same variables via the Vercel dashboard (Settings → Environment Variables). The `GOOGLE_APPLICATION_CREDENTIALS` path won't work in production — instead, set `GOOGLE_APPLICATION_CREDENTIALS_JSON` as the full JSON content of the key file, and update `imagen.ts` to parse it:

```typescript
// In imagen.ts, replace the client constructor with:
const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
  : undefined

const client = new PredictionServiceClient({
  apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  credentials,
})
```
