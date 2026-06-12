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
