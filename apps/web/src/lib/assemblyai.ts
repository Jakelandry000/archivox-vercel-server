const BASE = 'https://api.assemblyai.com/v2'

function headers() {
  return {
    Authorization: process.env.ASSEMBLYAI_API_KEY!,
    'Content-Type': 'application/json',
  }
}

export async function submitTranscription(audioUrl: string, webhookUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ audio_url: audioUrl, webhook_url: webhookUrl }),
  })
  const data = await res.json() as { id?: string; error?: string }
  if (!data.id) throw new Error(`AssemblyAI submit failed: ${data.error ?? JSON.stringify(data)}`)
  return data.id
}

export async function getTranscript(jobId: string): Promise<string> {
  const res = await fetch(`${BASE}/transcript/${jobId}`, { headers: headers() })
  const data = await res.json() as { text?: string; status?: string }
  return data.text ?? ''
}
