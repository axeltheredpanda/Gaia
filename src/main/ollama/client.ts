const DEFAULT_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'

export const OLLAMA_FILLER_MODEL = process.env.OLLAMA_FILLER_MODEL ?? 'llama3.2:3b'
export const OLLAMA_LOCAL_MODEL = process.env.OLLAMA_LOCAL_MODEL ?? 'llama3.1:8b'

let available = false

export function isOllamaAvailable(): boolean {
  return available
}

/** Ping Ollama au démarrage — les features locales se dégradent proprement si absent. */
export async function initOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    available = res.ok
  } catch {
    available = false
  }
  if (!available) {
    console.warn(
      '[Ollama] Non disponible sur localhost:11434 — filler vocal et routing local désactivés (lancez `ollama serve`).'
    )
  }
  return available
}

export async function generateText(options: {
  model: string
  prompt: string
  system?: string
  maxTokens?: number
}): Promise<string | null> {
  if (!available) return null
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        system: options.system,
        stream: false,
        options: { num_predict: options.maxTokens ?? 32, temperature: 0.9 }
      }),
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { response?: string }
    return data.response?.trim() || null
  } catch {
    return null
  }
}

export async function chatCompletion(options: {
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  onTextDelta?: (delta: string) => void
}): Promise<string | null> {
  if (!available) return null
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: Boolean(options.onTextDelta)
      }),
      signal: AbortSignal.timeout(120000)
    })
    if (!res.ok) return null

    if (!options.onTextDelta) {
      const data = (await res.json()) as { message?: { content?: string } }
      return data.message?.content?.trim() || null
    }

    const reader = res.body?.getReader()
    if (!reader) return null

    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const chunk = JSON.parse(line) as { message?: { content?: string } }
        const delta = chunk.message?.content
        if (delta) {
          full += delta
          options.onTextDelta(delta)
        }
      }
    }
    return full.trim() || null
  } catch {
    return null
  }
}
