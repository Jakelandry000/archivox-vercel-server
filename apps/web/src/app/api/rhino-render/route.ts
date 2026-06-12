import { NextResponse } from 'next/server'
import { renderArchitectural } from '@/lib/replicate'

export const maxDuration = 300

interface ViewInput {
  viewType: string
  imageBase64: string
}

interface ViewResult {
  viewType: string
  renderedBase64: string
  error?: string
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.RHINO_PLUGIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.views) || body.views.length === 0) {
    return NextResponse.json({ error: 'views array is required' }, { status: 400 })
  }

  const { views, prompt } = body as { views: ViewInput[]; prompt?: string }
  const stylePrompt = prompt ?? 'exterior architectural photography'

  // Sequential — avoids Replicate rate limits
  const rendered: ViewResult[] = []
  for (const v of views) {
    try {
      const renderedUrl = await renderArchitectural({
        image: `data:image/png;base64,${v.imageBase64}`,
        prompt: stylePrompt,
        viewType: v.viewType,
      })

      // Fetch the URL and convert to base64 for the plugin
      const imgRes = await fetch(renderedUrl)
      const buffer = await imgRes.arrayBuffer()
      const renderedBase64 = Buffer.from(buffer).toString('base64')

      rendered.push({ viewType: v.viewType, renderedBase64 })
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Render failed'
      console.error(`[rhino-render] ${v.viewType} failed:`, err)
      rendered.push({ viewType: v.viewType, renderedBase64: '', error: err })
    }
  }

  const allFailed = rendered.every(v => v.error)
  if (allFailed) {
    return NextResponse.json(
      { error: `All views failed. First error: ${rendered[0].error}`, views: rendered },
      { status: 500 }
    )
  }

  return NextResponse.json({ views: rendered })
}
