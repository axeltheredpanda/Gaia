import type Anthropic from '@anthropic-ai/sdk'
import { chatCompletion, OLLAMA_LOCAL_MODEL } from './client'

function blockContentToText(content: Anthropic.Beta.BetaMessageParam['content']): string | null {
  if (typeof content === 'string') return content.trim() || null
  const parts = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : null
}

function toOllamaMessages(
  history: Anthropic.Beta.BetaMessageParam[]
): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const msg of history) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    const text = blockContentToText(msg.content)
    if (!text) continue
    messages.push({ role: msg.role, content: text })
  }
  return messages
}

/** Chat texte pur via Ollama — pas de tool calling. */
export async function runOllamaChat(
  history: Anthropic.Beta.BetaMessageParam[],
  systemBlocks: Anthropic.Beta.BetaTextBlockParam[],
  onTextDelta?: (delta: string) => void
): Promise<{ text: string }> {
  const system = systemBlocks.map((block) => block.text).join('\n\n')
  const messages = [{ role: 'system' as const, content: system }, ...toOllamaMessages(history)]
  const text =
    (await chatCompletion({ model: OLLAMA_LOCAL_MODEL, messages, onTextDelta })) ??
    "Désolé, le modèle local n'a pas pu répondre."
  return { text }
}
