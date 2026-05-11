interface CobaltResponse {
  status: 'redirect' | 'tunnel' | 'picker' | 'error'
  url?: string
  error?: { code: string }
}

export async function getInstagramVideoUrl(reelUrl: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: reelUrl, videoQuality: '360' }),
    })

    if (!res.ok) return null
    const data = await res.json() as CobaltResponse

    if ((data.status === 'redirect' || data.status === 'tunnel') && data.url) {
      return data.url
    }

    return null
  } catch {
    return null
  }
}
