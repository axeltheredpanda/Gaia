import { generateText, isOllamaAvailable, OLLAMA_FILLER_MODEL } from './client'

const FALLBACK_FILLERS = [
  'Je regarde ça...',
  'Un instant...',
  'Laisse-moi vérifier...',
  "Je m'en occupe...",
  "D'accord, un moment..."
]

let lastFallbackIndex = -1

function pickFallback(): string {
  let idx = Math.floor(Math.random() * FALLBACK_FILLERS.length)
  if (FALLBACK_FILLERS.length > 1 && idx === lastFallbackIndex) {
    idx = (idx + 1) % FALLBACK_FILLERS.length
  }
  lastFallbackIndex = idx
  return FALLBACK_FILLERS[idx]
}

/** Phrase d'accroche TTS pendant la latence cloud — vitesse prioritaire sur la qualité. */
export async function generateVoiceFiller(): Promise<string> {
  if (!isOllamaAvailable()) return pickFallback()

  const generated = await generateText({
    model: OLLAMA_FILLER_MODEL,
    system:
      "Tu es Gaia. Réponds par UNE seule courte phrase d'accroche (max 8 mots), en français, pendant que tu travailles. Pas de guillemets ni d'explication.",
    prompt: 'Génère une variante courte et naturelle.',
    maxTokens: 20
  })
  if (!generated) return pickFallback()

  const line = generated.split('\n')[0].replace(/^["']|["']$/g, '').trim()
  if (line.length < 3 || line.length > 80) return pickFallback()
  return line
}
