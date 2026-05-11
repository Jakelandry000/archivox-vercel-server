function decodeEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
}

export async function getInstagramVideoUrl(reelUrl: string): Promise<string | null> {
  try {
    const res = await fetch(reelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    if (!res.ok) return null
    const html = await res.text()

    // Try og:video content attribute (two attribute orders)
    const ogMatch =
      html.match(/<meta[^>]+property="og:video(?::url)?"[^>]+content="([^"]+)"/i) ??
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:video(?::url)?"/i)
    if (ogMatch) return decodeEntities(ogMatch[1])

    // Try "video_url" embedded in page JSON
    const jsonMatch = html.match(/"video_url"\s*:\s*"(https:\\\/\\\/[^"]+\.mp4[^"]*)"/i)
    if (jsonMatch) return JSON.parse(`"${jsonMatch[1]}"`) as string

    return null
  } catch {
    return null
  }
}
