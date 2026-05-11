import { NextResponse } from 'next/server'
import { submitTranscription } from '@/lib/assemblyai'
import { sendTelegramMessage } from '@/lib/telegram'
import { createReelNote } from '@archivox/db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL}`

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  )
  const data = await res.json() as { ok: boolean; result?: { file_path: string } }
  if (!data.ok || !data.result?.file_path) return null
  return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const message = body?.message as {
    chat: { id: number }
    text?: string
    caption?: string
    video?: { file_id: string; file_size?: number }
  } | undefined

  if (!message) return NextResponse.json({ ok: true })

  const chatId = String(message.chat.id)
  const webhookUrl = `${APP_URL}/api/assemblyai/callback`

  // --- Handle video file ---
  if (message.video) {
    const fileSizeMb = (message.video.file_size ?? 0) / 1024 / 1024
    if (fileSizeMb > 19) {
      await sendTelegramMessage(chatId, '❌ Video is too large (max 19MB). Try a shorter reel.')
      return NextResponse.json({ ok: true })
    }

    const userNote = message.caption?.trim() || undefined
    await sendTelegramMessage(chatId, '⏳ Got it — transcribing your reel. I\'ll reply in about a minute.')

    try {
      const fileUrl = await getTelegramFileUrl(message.video.file_id)
      if (!fileUrl) {
        await sendTelegramMessage(chatId, '❌ Couldn\'t retrieve the video file. Please try again.')
        return NextResponse.json({ ok: true })
      }

      const jobId = await submitTranscription(fileUrl, webhookUrl)
      await createReelNote({ url: fileUrl, userNote: userNote ?? null, assemblyJobId: jobId, telegramChatId: chatId })
    } catch (err) {
      console.error('[telegram/webhook] video', err)
      await sendTelegramMessage(chatId, '❌ Something went wrong. Please try again.')
    }

    return NextResponse.json({ ok: true })
  }

  // --- Handle text message (Instagram URL fallback) ---
  const text = (message.text ?? '').trim()
  if (!text) return NextResponse.json({ ok: true })

  const [url, ...rest] = text.split(/\s+/)
  if (!url?.includes('instagram.com')) {
    await sendTelegramMessage(chatId, 'Send me a video file or an Instagram reel URL to analyze it.\n\nTip: download the reel on your phone and send the video file directly for best results.')
    return NextResponse.json({ ok: true })
  }

  await sendTelegramMessage(chatId, '⏳ Got it — fetching your reel. I\'ll reply in about a minute.')
  await sendTelegramMessage(chatId, '💡 Tip: if this fails, download the reel on your phone and send the video file directly instead.')

  try {
    const { getInstagramVideoUrl } = await import('@/lib/instagram')
    const userNote = rest.join(' ') || undefined
    const videoUrl = await getInstagramVideoUrl(url)

    if (!videoUrl) {
      await sendTelegramMessage(chatId, '❌ Instagram is blocking the request. Please download the reel on your phone and send the video file directly to this bot.')
      return NextResponse.json({ ok: true })
    }

    const jobId = await submitTranscription(videoUrl, webhookUrl)
    await createReelNote({ url, userNote: userNote ?? null, assemblyJobId: jobId, telegramChatId: chatId })
  } catch (err) {
    console.error('[telegram/webhook] url', err)
    await sendTelegramMessage(chatId, '❌ Something went wrong. Please try sending the video file directly.')
  }

  return NextResponse.json({ ok: true })
}
