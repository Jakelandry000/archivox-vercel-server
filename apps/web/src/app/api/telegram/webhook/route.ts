import { NextResponse } from 'next/server'
import { getInstagramVideoUrl } from '@/lib/instagram'
import { submitTranscription } from '@/lib/assemblyai'
import { sendTelegramMessage } from '@/lib/telegram'
import { createReelNote } from '@archivox/db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`

export async function POST(req: Request) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const message = body?.message as { chat: { id: number }; text?: string } | undefined
  if (!message) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)
  const text = (message.text ?? '').trim()
  const [url, ...rest] = text.split(/\s+/)
  const userNote = rest.join(' ') || undefined

  if (!url?.includes('instagram.com')) {
    await sendTelegramMessage(chatId, 'Send an Instagram reel URL to analyze it.\n\nExample: https://instagram.com/reel/xyz optional note about the reel')
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(chatId, '⏳ Got it — fetching and transcribing your reel. I\'ll reply in about a minute.')

  try {
    const videoUrl = await getInstagramVideoUrl(url)
    if (!videoUrl) {
      await sendTelegramMessage(chatId, '❌ Couldn\'t extract the video from that reel. Instagram may be blocking it. Try sending the reel with a brief description of its content instead.')
      return NextResponse.json({ ok: true })
    }

    const webhookUrl = `${APP_URL}/api/assemblyai/callback`
    const jobId = await submitTranscription(videoUrl, webhookUrl)

    await createReelNote({ url, userNote: userNote ?? null, assemblyJobId: jobId, telegramChatId: chatId })
  } catch (err) {
    console.error('[telegram/webhook]', err)
    await sendTelegramMessage(chatId, '❌ Something went wrong starting the transcription. Please try again.')
  }

  return NextResponse.json({ ok: true })
}
