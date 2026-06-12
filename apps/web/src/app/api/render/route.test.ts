import { describe, it, expect, vi } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/imagen', () => ({
  renderImage: vi.fn().mockResolvedValue('base64renderedimagedata'),
}))

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://blob.vercel-storage.com/rendered-abc.png' }),
}))

vi.mock('@archivox/db', () => ({
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
