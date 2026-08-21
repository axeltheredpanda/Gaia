import type Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './systemPrompt'
import { routeModel } from './router'
import { runToolLoop } from './toolLoop'
import { appendMessage, loadRecentHistory, getConversationSummary, maybeSummarize } from '../supabase/history'
import { getMemoryFactsBlock } from '../supabase/memory'

export interface ChatReply {
  text: string
  model: string
}

export async function sendChat(userText: string): Promise<ChatReply> {
  const model = routeModel(userText)
  const history = await loadRecentHistory()
  const [summary, memoryBlock] = await Promise.all([getConversationSummary(), getMemoryFactsBlock()])

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
  ]
  if (memoryBlock) system.push({ type: 'text', text: `Faits durables sur Axel :\n${memoryBlock}` })
  if (summary) system.push({ type: 'text', text: `Résumé de la conversation précédente :\n${summary}` })

  const userMessage: Anthropic.Beta.BetaMessageParam = { role: 'user', content: userText }
  const { text, messages } = await runToolLoop([...history, userMessage], {
    model,
    maxTokens: 1024,
    system,
    includeWebSearch: true
  })

  const newMessages = messages.slice(history.length)
  for (const message of newMessages) {
    await appendMessage(message.role as 'user' | 'assistant', message.content)
  }
  await maybeSummarize().catch((error: unknown) => console.error('Résumé de conversation échoué', error))

  return { text, model }
}
