export interface ReelAnalysis {
  summary: string
  applicability: 'Applicable' | 'Maybe' | 'Not applicable'
  archivoxUseCase: string | null
}

export async function analyzeReel(
  url: string,
  transcript: string,
  userNote?: string
): Promise<ReelAnalysis> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: 'You analyze Instagram reels for relevance to ArchiVox — an AI tool that converts natural language into architectural floor plans, SVG, and AutoCAD scripts. Respond with valid JSON only, no other text.',
      messages: [
        {
          role: 'user',
          content: `URL: ${url}
${userNote ? `User note: ${userNote}` : ''}
Transcript: ${transcript || '(no transcript — audio may be music only)'}

Respond with this JSON shape:
{
  "summary": "2–3 sentence summary of what the reel covers",
  "applicability": "Applicable" | "Maybe" | "Not applicable",
  "archivoxUseCase": "How this could inform ArchiVox features or design (null if not applicable)"
}`,
        },
      ],
    }),
  })

  const data = await res.json() as { content?: Array<{ type: string; text: string }> }
  const text = data.content?.find(b => b.type === 'text')?.text ?? '{}'
  return JSON.parse(text) as ReelAnalysis
}
