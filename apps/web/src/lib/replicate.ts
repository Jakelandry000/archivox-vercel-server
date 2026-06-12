const ARCH_SUFFIX = [
  'photorealistic architectural CGI visualization',
  'dusk blue hour twilight lighting',
  'warm amber interior lights glowing through floor-to-ceiling glass',
  'dramatic deep blue sky with soft clouds',
  'lush mature trees and curated landscape',
  'people silhouettes for scale',
  'cinematic depth of field',
  'award-winning architectural photography',
  'hyper-detailed 8k sharp',
].join(', ')

interface RenderOptions {
  image: string       // HTTPS URL or data:image/png;base64,... URI
  prompt: string
  viewType?: string   // 'Plan' | 'SouthElevation' | 'Perspective3D' etc.
  strength?: number   // 0–1, default 0.78
}

export async function renderArchitectural(options: RenderOptions): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) throw new Error('REPLICATE_API_TOKEN not set in Vercel env')

  const { image, prompt, viewType, strength = 0.78 } = options

  const viewLabel = !viewType ? ''
    : viewType === 'Plan' ? 'top-down architectural floor plan, '
    : viewType.includes('Elevation') ? `${viewType.replace('Elevation', '').trim()} building elevation, `
    : 'exterior perspective architectural render, '

  const fullPrompt = `${viewLabel}${prompt}, ${ARCH_SUFFIX}`

  const createRes = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: fullPrompt,
          image,
          strength,
          num_inference_steps: 28,
          guidance: 3.5,
          output_format: 'png',
          output_quality: 95,
          aspect_ratio: '16:9',
        },
      }),
    }
  )

  if (createRes.status === 429) {
    throw new Error('Replicate rate limit — add billing at replicate.com/account')
  }

  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({})) as any
    throw new Error(body.detail ?? body.error ?? `Replicate HTTP ${createRes.status}`)
  }

  let prediction = await createRes.json()
  let attempts = 0

  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 90) {
    await new Promise(r => setTimeout(r, 2000))
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    prediction = await poll.json()
    attempts++
  }

  if (prediction.status === 'failed') throw new Error(prediction.error ?? 'Prediction failed')
  if (prediction.status !== 'succeeded') throw new Error(`Timed out after ${attempts * 2}s`)

  const out = prediction.output
  return Array.isArray(out) ? out[0]
    : typeof out === 'string' ? out
    : (out as any)?.url ?? String(out)
}
