import type Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './systemPrompt'
import { getCurrentDateTimeLine } from './datetime'
import { routeModel } from './router'
import { runToolLoop } from './toolLoop'
import { appendMessage, loadRecentHistory, getConversationSummary } from '../supabase/history'
import { getCoreFactsBlock, getPeripheralFactsBlock } from '../supabase/memory'
import { buildUserContent, type Attachment } from './attachments'
import { extractPageForUrl } from '../tools/webPage'

export interface ChatReply {
  text: string
  model: string
  taskActions: string[]
  imageDataUri: string | null
}

export async function sendChat(
  userText: string,
  attachments?: Attachment[],
  onTextDelta?: (delta: string) => void
): Promise<ChatReply> {
  const model = routeModel(userText)
  const history = await loadRecentHistory()
  const [summary, coreBlock, peripheralBlock] = await Promise.all([
    getConversationSummary(),
    getCoreFactsBlock(),
    getPeripheralFactsBlock(userText)
  ])

  // persona + faits core : stables, regroupés dans le seul bloc mis en cache
  const cachedText = coreBlock ? `${SYSTEM_PROMPT}\n\nFaits durables sur Axel :\n${coreBlock}` : SYSTEM_PROMPT

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // TTL 1h (spec 8.10) plutôt que le défaut 5 min : usage réel intermittent dans la journée,
    // l'écart entre deux échanges dépasse souvent 5 min mais reste probablement sous 1h.
    { type: 'text', text: cachedText, cache_control: { type: 'ephemeral', ttl: '1h' } },
    // jamais cache_control ici : doit être fraîche à chaque requête
    { type: 'text', text: getCurrentDateTimeLine() }
  ]
  if (peripheralBlock) system.push({ type: 'text', text: `Faits potentiellement pertinents :\n${peripheralBlock}` })
  if (summary) system.push({ type: 'text', text: `Résumé de la conversation précédente :\n${summary}` })

  const pageContext = await extractPageForUrl(userText).catch((error: unknown) => {
    console.error('Extraction de page web échouée', error)
    return null
  })
  const contentText = pageContext ? `${pageContext}\n\n${userText}` : userText

  const userMessage: Anthropic.Beta.BetaMessageParam = {
    role: 'user',
    content: buildUserContent(contentText, attachments)
  }
  const { text, messages, taskActions, imageDataUri } = await runToolLoop([...history, userMessage], {
    model,
    maxTokens: 1024,
    system,
    includeWebSearch: true,
    includeImageSearch: true,
    includeBriefingTools: true,
    includeScreenshotTool: true,
    emitHudEvents: true,
    onTextDelta
  })

  const newMessages = messages.slice(history.length)
  for (const message of newMessages) {
    await appendMessage(message.role as 'user' | 'assistant', message.content)
  }

  return { text, model, taskActions, imageDataUri }
}
