import type Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './systemPrompt'
import { getCurrentDateTimeLine } from './datetime'
import { routeModel, OLLAMA_LOCAL_MODEL } from './router'
import { runToolLoop } from './toolLoop'
import { appendMessage, loadRecentHistory, getConversationSummary, contentForPersistence } from '../supabase/history'
import {
  getCoreFactsBlock,
  getPeripheralFactsBlock,
  getStyleInteractionFactsBlock
} from '../supabase/memory'
import { buildUserContent, type Attachment } from './attachments'
import { extractPageForUrl } from '../tools/webPage'
import { isOllamaAvailable } from '../ollama/client'
import { runOllamaChat } from '../ollama/chat'
import { extractPeripheralFactsAfterExchange } from './memoryExtraction'
import { emitHudState } from '../hud/hudState'

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
  const model = routeModel(userText, {
    hasAttachments: (attachments?.length ?? 0) > 0,
    ollamaAvailable: isOllamaAvailable()
  })
  const history = await loadRecentHistory()
  const [summary, coreBlock, peripheralBlock, styleBlock] = await Promise.all([
    getConversationSummary(),
    getCoreFactsBlock(),
    getPeripheralFactsBlock(userText),
    getStyleInteractionFactsBlock()
  ])

  // persona + faits core : stables, regroupés dans le seul bloc mis en cache
  const cachedText = coreBlock ? `${SYSTEM_PROMPT}\n\nFaits durables sur Axel :\n${coreBlock}` : SYSTEM_PROMPT

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // TTL 1h (spec 8.10) plutôt que le défaut 5 min : usage réel intermittent dans la journée,
    // l'écart entre deux échanges dépasse souvent 5 min mais reste probablement sous 1h.
    { type: 'text', text: cachedText, cache_control: { type: 'ephemeral', ttl: '1h' } }
  ]
  if (styleBlock) {
    system.push({ type: 'text', text: `Préférences d'interaction d'Axel :\n${styleBlock}` })
  }
  // jamais cache_control ici : doit être fraîche à chaque requête
  system.push({ type: 'text', text: getCurrentDateTimeLine() })
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

  let text: string
  let messages: Anthropic.Beta.BetaMessageParam[]
  let taskActions: string[]
  let imageDataUri: string | null

  if (model === OLLAMA_LOCAL_MODEL) {
    emitHudState('thinking', 'Modèle local...')
    const result = await runOllamaChat([...history, userMessage], system, onTextDelta)
    text = result.text
    messages = [...history, userMessage, { role: 'assistant', content: text }]
    taskActions = []
    imageDataUri = null
    emitHudState('responding')
  } else {
    const cloud = await runToolLoop([...history, userMessage], {
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
    text = cloud.text
    messages = cloud.messages
    taskActions = cloud.taskActions
    imageDataUri = cloud.imageDataUri
  }

  const userPersisted = contentForPersistence('user', userMessage.content)
  if (userPersisted) await appendMessage('user', userPersisted)

  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'assistant') {
    const assistantPersisted = contentForPersistence('assistant', lastMessage.content)
    if (assistantPersisted) await appendMessage('assistant', assistantPersisted)
  }

  void extractPeripheralFactsAfterExchange(userText, text).catch((error: unknown) => {
    console.error('Extraction mémoire peripheral échouée', error)
  })

  return { text, model, taskActions, imageDataUri }
}
