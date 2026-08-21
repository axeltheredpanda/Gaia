const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const SONNET_MODEL = 'claude-sonnet-5'

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

const SHORT_MESSAGE_WORD_LIMIT = 12
const LONG_MESSAGE_WORD_LIMIT = 25

/**
 * Heuristique simple (spec 4.5) : pas de classificateur LLM pour la V1.
 * Sonnet dès qu'un signal d'ouverture/raisonnement multi-étapes apparaît ou
 * que le message est long ; Haiku pour l'ajout de todo et les messages courts.
 */
export function routeModel(userText: string): typeof HAIKU_MODEL | typeof SONNET_MODEL {
  const text = userText.trim().toLowerCase()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  const looksOpenEnded =
    OPEN_ENDED_MARKERS.some((marker) => text.includes(marker)) || wordCount > LONG_MESSAGE_WORD_LIMIT
  if (looksOpenEnded) return SONNET_MODEL

  const isTodoIntent = TODO_VERBS.some((verb) => text.includes(verb))
  if (isTodoIntent || wordCount <= SHORT_MESSAGE_WORD_LIMIT) return HAIKU_MODEL

  return SONNET_MODEL
}
