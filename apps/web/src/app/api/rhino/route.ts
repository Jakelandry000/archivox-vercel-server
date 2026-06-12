import { NextResponse } from 'next/server'

export const maxDuration = 300

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.RHINO_PLUGIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Strip extended thinking — keeps responses well under the 60s function limit
  const { thinking: _thinking, ...forwardBody } = body

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(forwardBody),
    })

    const text = await anthropicRes.text()

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return NextResponse.json(
        { error: `Anthropic returned non-JSON: ${text.slice(0, 200)}` },
        { status: 502 }
      )
    }

    return NextResponse.json(data, { status: anthropicRes.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Proxy error: ${message}` }, { status: 500 })
  }
}
