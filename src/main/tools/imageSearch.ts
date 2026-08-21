const MAX_IMAGE_BYTES = 8 * 1024 * 1024

interface ImageCandidate {
  url: string
  title?: string
  sourceLabel: string
}

/** SDK googleapis évité : un seul appel REST, fetch suffit — pas de raison d'ajouter la dépendance. */
async function searchGoogleImages(query: string): Promise<ImageCandidate | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY
  const cx = process.env.GOOGLE_CSE_ID
  if (!apiKey || !cx) return null

  const url = new URL('https://customsearch.googleapis.com/customsearch/v1')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  url.searchParams.set('searchType', 'image')
  url.searchParams.set('num', '1')
  url.searchParams.set('safe', 'active')

  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { items?: { link: string; title?: string; displayLink?: string }[] }
  const item = data.items?.[0]
  if (!item) return null
  return { url: item.link, title: item.title, sourceLabel: item.displayLink ?? 'Google' }
}

async function searchOpenverse(query: string): Promise<ImageCandidate | null> {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', '1')

  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { results?: { url: string; title?: string; source?: string }[] }
  const item = data.results?.[0]
  if (!item) return null
  return { url: item.url, title: item.title, sourceLabel: item.source ?? 'Openverse' }
}

/**
 * Le résultat pointe vers un domaine tiers arbitraire (le site source, pas Google/Openverse) :
 * le main process récupère les octets ici et les sert au renderer en data URI, qui n'a donc
 * jamais besoin de charger une origine tierce (voir CSP img-src 'self' data: dans index.html).
 */
async function fetchImageAsDataUri(url: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) return null
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_IMAGE_BYTES) return null
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`
}

export interface ImageSearchResult {
  toolResultText: string
  imageDataUri?: string
}

export async function searchImage(query: string): Promise<ImageSearchResult> {
  const candidate = (await searchGoogleImages(query).catch(() => null)) ?? (await searchOpenverse(query).catch(() => null))
  if (!candidate) {
    return { toolResultText: `Aucune image trouvée pour "${query}".` }
  }

  const imageDataUri = await fetchImageAsDataUri(candidate.url).catch(() => null)
  if (!imageDataUri) {
    return { toolResultText: `Image trouvée (${candidate.sourceLabel}) mais impossible de la charger.` }
  }

  return {
    toolResultText: `Image trouvée : "${candidate.title ?? query}" (source : ${candidate.sourceLabel}). Elle est déjà affichée à l'utilisateur dans le HUD — ne la redécris pas en détail, une phrase de contexte suffit.`,
    imageDataUri
  }
}
