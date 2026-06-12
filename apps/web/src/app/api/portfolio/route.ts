import { NextResponse } from 'next/server'
import { renderArchitectural } from '@/lib/replicate'

export const maxDuration = 300

export interface PortfolioView {
  id: string
  viewType: string
  originalUrl: string
}

export interface RenderedPortfolioView extends PortfolioView {
  renderedUrl: string
  error?: string
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.views) || body.views.length === 0) {
    return NextResponse.json({ error: 'views array is required' }, { status: 400 })
  }

  const { views, prompt } = body as { views: PortfolioView[]; prompt?: string }
  const stylePrompt = prompt ?? 'exterior architectural photography'

  // Sequential to avoid Replicate rate limits
  const rendered: RenderedPortfolioView[] = []
  for (const view of views) {
    try {
      const renderedUrl = await renderArchitectural({
        image: view.originalUrl,
        prompt: stylePrompt,
        viewType: view.viewType,
      })
      rendered.push({ ...view, renderedUrl })
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Render failed'
      rendered.push({ ...view, renderedUrl: '', error })
    }
  }

  const allFailed = rendered.every(v => v.error)
  if (allFailed) {
    return NextResponse.json(
      { error: `All views failed. First: ${rendered[0].error}`, views: rendered },
      { status: 500 }
    )
  }

  return NextResponse.json({ views: rendered })
}
