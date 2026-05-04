import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from './client'
import { createRender, getRendersByProject, updateRender } from './renders'

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
