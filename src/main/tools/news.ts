import Parser from 'rss-parser'
import { getRssFeedOverride } from '../supabase/settings'

// Défauts : générale, finance, tech (spec 8.1/8.9) — sources fixées explicitement après un premier
// test ayant remonté un article hors-sujet ; remplaçables via l'écran paramètres (spec 8.8).
const DEFAULT_FEEDS = [
  'https://www.lemonde.fr/rss/une.xml', // actu générale
  'https://services.lesechos.fr/rss/les-echos-finance-marches.xml', // finance
  'https://techcrunch.com/feed/' // tech
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
