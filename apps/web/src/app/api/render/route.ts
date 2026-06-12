import { NextResponse } from 'next/server'
import { renderArchitectural } from '@/lib/replicate'

export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body?.originalUrl) {
    return NextResponse.json({ error: 'originalUrl is required' }, { status: 400 })
  }

  const { originalUrl, prompt } = body

  try {
    const renderedUrl = await renderArchitectural({
      image: originalUrl,
      prompt: prompt ?? 'exterior architectural photography',
    })

    return NextResponse.json({ renderedUrl, originalUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Render failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
