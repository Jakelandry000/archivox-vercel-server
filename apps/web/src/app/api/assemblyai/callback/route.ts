import { NextResponse } from 'next/server'
import { getReelNoteByJobId, updateReelNote } from '@archivox/db'
import { getTranscript } from '@/lib/assemblyai'
import { analyzeReel } from '@/lib/analyze-reel'
import { sendTelegramMessage } from '@/lib/telegram'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const jobId = body?.transcript_id as string | undefined
  const status = body?.status as string | undefined

  if (!jobId) return NextResponse.json({ ok: true })

  const note = await getReelNoteByJobId(jobId)
  if (!note) return NextResponse.json({ ok: true })

  if (status === 'error') {
    await updateReelNote(note.id, { status: 'failed', summary: 'Transcription failed', applicability: 'Not applicable' })
    if (note.telegramChatId) {
      await sendTelegramMessage(note.telegramChatId, '❌ Transcription failed — the reel audio may not be accessible.')
    }
    return NextResponse.json({ ok: true })
  }

  if (status !== 'completed') return NextResponse.json({ ok: true })

  try {
    const transcript = await getTranscript(jobId)
    const analysis = await analyzeReel(note.url, transcript, note.userNote ?? undefined)

    await updateReelNote(note.id, {
      summary: analysis.summary,
      applicability: analysis.applicability,
      archivoxUseCase: analysis.archivoxUseCase,
      status: 'done',
    })

    if (note.telegramChatId) {
      const useCase = analysis.archivoxUseCase ? `\n*Use case:* ${analysis.archivoxUseCase}` : ''
      await sendTelegramMessage(
        note.telegramChatId,
        `✅ *Reel analyzed*\n\n*Summary:* ${analysis.summary}\n\n*ArchiVox relevance:* ${analysis.applicability}${useCase}`
      )
    }
  } catch (err) {
    console.error('[assemblyai/callback]', err)
    await updateReelNote(note.id, { status: 'failed' })
    if (note.telegramChatId) {
      await sendTelegramMessage(note.telegramChatId, '❌ Analysis failed after transcription. Please try again.')
    }
  }

  return NextResponse.json({ ok: true })
}
