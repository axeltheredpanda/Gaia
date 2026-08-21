import Parser from 'rss-parser'
import { getRssFeedOverride } from '../supabase/settings'

// Défauts : tech, finance, actu générale (spec 8.1) — remplaçables via l'écran paramètres (spec 8.8).
const DEFAULT_FEEDS = [
  'https://hnrss.org/frontpage', // tech
  'https://www.lesechos.fr/rss/rss_une.xml', // finance
  'https://www.lemonde.fr/rss/une.xml' // actu générale
]

const parser = new Parser()

/** rss-parser : gratuit, sans clé (spec 8.1). Un titre par flux, best-effort par flux. */
export async function getNews(): Promise<string> {
  const feeds = (await getRssFeedOverride().catch(() => null)) ?? DEFAULT_FEEDS

  const results = await Promise.allSettled(feeds.map((url) => parser.parseURL(url)))
  const headlines = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof parser.parseURL>>> => r.status === 'fulfilled')
    .map((r) => r.value.items[0]?.title)
    .filter((title): title is string => Boolean(title))

  return headlines.length > 0 ? headlines.join(' | ') : 'Aucune actualité disponible pour le moment.'
}
