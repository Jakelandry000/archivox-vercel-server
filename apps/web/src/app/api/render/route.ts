import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { renderImage } from '@/lib/imagen'
import { createRender, updateRender } from '@archivox/db'

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
    const imageResponse = await fetch(originalUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const imageBase64 = Buffer.from(imageBuffer).toString('base64')

    const renderedBase64 = await renderImage({
      imageBase64,
      prompt: prompt ?? 'photorealistic architectural rendering with landscape context',
      projectId: process.env.GOOGLE_CLOUD_PROJECT!,
    })

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
