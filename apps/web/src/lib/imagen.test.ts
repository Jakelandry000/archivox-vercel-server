import { describe, it, expect, vi } from 'vitest'
import { renderImage } from './imagen'

vi.mock('@google-cloud/aiplatform', () => ({
  PredictionServiceClient: class {
    predict = vi.fn().mockResolvedValue([
      {
        predictions: [
          {
            bytesBase64Encoded: Buffer.from('fake-image-bytes').toString('base64'),
          },
        ],
      },
    ])
  },
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
