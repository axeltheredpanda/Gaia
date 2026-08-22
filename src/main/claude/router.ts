import { OLLAMA_LOCAL_MODEL } from '../ollama/client'

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
export const SONNET_MODEL = 'claude-sonnet-5'

export { OLLAMA_LOCAL_MODEL }

export type RoutedModel = typeof HAIKU_MODEL | typeof SONNET_MODEL | typeof OLLAMA_LOCAL_MODEL

const TODO_VERBS = [
  'ajoute',
  'ajouter',
  'note',
  'noter',
  'rappelle-moi',
  'rappelle moi',
  'crée une tâche',
  'crée la tâche',
  'todo'
]

const OPEN_ENDED_MARKERS = [
  'pourquoi',
  'comment',
  'compare',
  'compte tenu',
  'explique',
  'analyse',
  'résume',
  'aide-moi',
  'planifie',
  'plan pour'
]

/** Données externes ou tools probables — jamais le palier local. */
const EXTERNAL_DATA_MARKERS = [
  'météo',
  'meteo',
  'weather',
  'actualité',
  'actualite',
  'news',
  'linear',
  'calendrier',
  'calendar',
  'google tasks',
  'tâche',
  'taches',
  'todo',
  'image',
  'photo',
  'screenshot',
  'écran',
  'ecran',
  'capture',
  'recherche',
  'cherche sur',
  'http://',
  'https://',
  'www.'
]

/** Intentions text-only explicites — seul signal positif fort pour le palier local. */
const LOCAL_INTENT_MARKERS = [
  'traduis',
  'translate',
  'traduction',
  'reformule',
  'reformuler',
  'reformulation',
  'raccourci',
  'plus court',
  'plus long',
  'plus formel',
  'plus informel',
  'en anglais',
  'en français',
  'en francais',
  'corrige',
  'correction',
  'orthographe',
  'grammaire',
  'grammaticale',
  'paraphrase',
  'synonyme',
  'autrement dit',
  'mets en',
  'version courte',
  'version longue',
  'ton plus'
]

/** Questions sur le fil de conversation déjà présent — signal faible, formulé explicitement seulement. */
const CONTEXT_ONLY_MARKERS = [
  'tu viens de dire',
  'tu as dit',
  'dans ton message',
  'dans ta réponse',
  "ce que tu entends par",
  "qu'entends-tu par",
  'clarifie ce que',
  'précise ce que'
]

const SHORT_MESSAGE_WORD_LIMIT = 12
const LONG_MESSAGE_WORD_LIMIT = 25
const LOCAL_MAX_WORDS = 40

export function isCloudModel(model: string): boolean {
  return model === HAIKU_MODEL || model === SONNET_MODEL
}

/**
 * Palier local Ollama (spec 10.2) — conservateur : en cas de doute → cloud (Haiku/Sonnet).
 *
 * Route vers Ollama UNIQUEMENT si TOUTES ces conditions :
 * 1. Ollama disponible (vérifié au démarrage).
 * 2. Pas de pièce jointe (vision/document = Claude).
 * 3. Aucun marqueur EXTERNAL_DATA (météo, todos, web, image, capture…).
 * 4. Aucun verbe TODO.
 * 5. Aucun marqueur OPEN_ENDED (explique, analyse, résume, plan…).
 * 6. Message ≤ 40 mots.
 * 7. Au moins un marqueur LOCAL_INTENT (traduction/reformulation/correction de ton)
 *    OU un marqueur CONTEXT_ONLY explicite (question sur ce qui vient d'être dit).
 *
 * Exemples :
 * - « Traduis en anglais : … » → local
 * - « Reformule plus court » → local
 * - « Quel temps fait-il ? » → Haiku (météo)
 * - « Explique pourquoi… » → Sonnet (open-ended)
 * - « Ajoute une tâche… » → Haiku (todo)
 */
export function shouldRouteToLocal(userText: string, hasAttachments: boolean): boolean {
  if (hasAttachments) return false

  const text = userText.trim().toLowerCase()
  const wordCount = text.split(/\s+/).filter(Boolean).length
  if (wordCount === 0 || wordCount > LOCAL_MAX_WORDS) return false

  if (EXTERNAL_DATA_MARKERS.some((marker) => text.includes(marker))) return false
  if (TODO_VERBS.some((verb) => text.includes(verb))) return false
  if (OPEN_ENDED_MARKERS.some((marker) => text.includes(marker))) return false

  const hasLocalIntent = LOCAL_INTENT_MARKERS.some((marker) => text.includes(marker))
  const hasContextOnly = CONTEXT_ONLY_MARKERS.some((marker) => text.includes(marker))
  return hasLocalIntent || hasContextOnly
}

/**
 * Heuristique simple (spec 4.5 + palier local spec 10.2) : pas de classificateur LLM.
 * Ordre : Sonnet (ouvert/long) → local Ollama (text-only explicite) → Haiku (todo/court) → Sonnet.
 */
export function routeModel(
  userText: string,
  options?: { hasAttachments?: boolean; ollamaAvailable?: boolean }
): RoutedModel {
  const text = userText.trim().toLowerCase()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  const looksOpenEnded =
    OPEN_ENDED_MARKERS.some((marker) => text.includes(marker)) || wordCount > LONG_MESSAGE_WORD_LIMIT
  if (looksOpenEnded) return SONNET_MODEL

  if (options?.ollamaAvailable && shouldRouteToLocal(userText, options.hasAttachments ?? false)) {
    return OLLAMA_LOCAL_MODEL
  }

  const isTodoIntent = TODO_VERBS.some((verb) => text.includes(verb))
  if (isTodoIntent || wordCount <= SHORT_MESSAGE_WORD_LIMIT) return HAIKU_MODEL

  return SONNET_MODEL
}
