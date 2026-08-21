import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

const URL_RE = /https?:\/\/[^\s]+/

const MAX_CHARS = 6000

/** Résumé de page web (spec 8.6) : fetch + extraction faits ici, jamais via le tool "fetch" natif de l'API. */
export async function extractPageForUrl(text: string): Promise<string | null> {
  const match = text.match(URL_RE)
  if (!match) return null
  const url = match[0]

  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return `[Page ${url} inaccessible]`

  const html = await res.text()
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  if (!article?.textContent) return `[Contenu de ${url} illisible]`

  const content = article.textContent.trim().slice(0, MAX_CHARS)
  return `[Contenu de la page ${url}${article.title ? ` — ${article.title}` : ''}]\n${content}`
}
