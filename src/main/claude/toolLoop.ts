import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { getLinearMcpServer } from '../mcp/linear'
import { getGoogleCalendarMcpServer } from '../mcp/googleCalendar'
import { getGoogleTasksTools, callGoogleTasksTool } from '../mcp/googleTasksClient'
import { searchImage } from '../tools/imageSearch'
import { getWeather } from '../tools/weather'
import { getNews } from '../tools/news'
import { captureScreenshot } from '../tools/screenshot'
import { emitHudState } from '../hud/hudState'

const MAX_TOOL_ITERATIONS = 5

const SEARCH_IMAGE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'search_image',
  description:
    "Recherche une image sur le web et l'affiche directement à l'utilisateur dans l'interface (le résultat n'est PAS à décrire en détail, juste à situer en une phrase). À utiliser quand Axel demande explicitement une image/photo, ou quand une image aiderait clairement à répondre (« à quoi ressemble X »). Ne jamais l'utiliser pour du texte ou des données.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Termes de recherche, en anglais de préférence (meilleurs résultats)' }
    },
    required: ['query']
  }
}

const GET_WEATHER_TOOL: Anthropic.Beta.BetaTool = {
  name: 'get_weather',
  description:
    "Météo actuelle et du jour pour une ville. Déduis la ville du contexte utilisateur disponible (faits durables, ville indiquée explicitement) si Axel ne la précise pas.",
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string', description: 'Nom de la ville' } },
    required: ['city']
  }
}

const GET_NEWS_TOOL: Anthropic.Beta.BetaTool = {
  name: 'get_news',
  description: "Derniers titres d'actualité (tech, finance, actu générale).",
  input_schema: { type: 'object', properties: {} }
}

const CAPTURE_SCREENSHOT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'capture_screenshot',
  description:
    "Capture l'écran d'Axel à sa demande explicite (« montre-moi ce qui est affiché », « qu'est-ce qu'il y a sur mon écran »). Ne JAMAIS l'utiliser sans demande explicite. Choisis 'active_window' si Axel parle d'une fenêtre/appli précise, 'screen' pour l'écran entier.",
  input_schema: {
    type: 'object',
    properties: { target: { type: 'string', enum: ['active_window', 'screen'] } },
    required: ['target']
  }
}

export interface ToolLoopOptions {
  model: string
  maxTokens: number
  system?: Anthropic.Beta.BetaTextBlockParam[]
  includeWebSearch?: boolean
  includeImageSearch?: boolean
  includeBriefingTools?: boolean
  /** Jamais activé pour le job de badge HUD en tâche de fond — capture strictement à la demande (spec 8.7). */
  includeScreenshotTool?: boolean
  /** Uniquement pour un appel déclenché par l'utilisateur — le rafraîchissement du badge HUD en tâche de fond ne doit jamais faire clignoter l'état "thinking" à l'insu de l'utilisateur. */
  emitHudEvents?: boolean
}

export interface ToolLoopResult {
  text: string
  messages: Anthropic.Beta.BetaMessageParam[]
  taskActions: string[]
  imageDataUri: string | null
}

function clientToolLabel(name: string): string {
  if (name === 'search_image') return 'Recherche une image...'
  if (name === 'get_weather') return 'Consulte la météo...'
  if (name === 'get_news') return "Consulte l'actualité..."
  if (name === 'capture_screenshot') return "Capture l'écran..."
  return 'Consulte Google Tasks...'
}

interface ClientToolResult {
  text: string
  imageDataUri?: string
  /** search_image est affiché à l'utilisateur mais pas redécrit par le modèle ; capture_screenshot doit au contraire être "vu" pour répondre aux questions dessus. */
  feedImageToModel?: boolean
}

async function executeClientTool(
  name: string,
  input: Record<string, unknown>,
  emitEvents: boolean
): Promise<ClientToolResult> {
  if (emitEvents) emitHudState('thinking', clientToolLabel(name))
  if (name === 'search_image') {
    const result = await searchImage(input.query as string)
    return { text: result.toolResultText, imageDataUri: result.imageDataUri }
  }
  if (name === 'get_weather') return { text: await getWeather(input.city as string) }
  if (name === 'get_news') return { text: await getNews() }
  if (name === 'capture_screenshot') {
    const result = await captureScreenshot(input.target as 'active_window' | 'screen')
    return { text: result.text, imageDataUri: result.imageDataUri, feedImageToModel: true }
  }
  return { text: await callGoogleTasksTool(name, input) }
}

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

function imageBlockFromDataUri(dataUri: string): Anthropic.Beta.BetaImageBlockParam {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) throw new Error('Data URI image invalide')
  return {
    type: 'image',
    source: { type: 'base64', media_type: match[1] as ImageMediaType, data: match[2] }
  }
}

/**
 * Boucle d'appel d'outils partagée par le chat et le rafraîchissement du badge HUD :
 * appelle l'API, exécute les tool_use côté client (Google Tasks, recherche d'image) et boucle
 * jusqu'à une réponse finale. Linear passe par mcp_servers (exécuté côté serveur Anthropic) —
 * ses appels d'outils apparaissent en blocs `mcp_tool_use` déjà résolus.
 */
export async function runToolLoop(
  messages: Anthropic.Beta.BetaMessageParam[],
  options: ToolLoopOptions
): Promise<ToolLoopResult> {
  const client = getClaudeClient()
  const mcpServers = (await Promise.all([getLinearMcpServer(), getGoogleCalendarMcpServer()])).filter(
    (server) => server !== null
  )
  const googleTasksTools = await getGoogleTasksTools().catch(() => [])

  const tools: Anthropic.Beta.BetaToolUnion[] = [...googleTasksTools]
  if (options.includeWebSearch) tools.push({ type: 'web_search_20250305' as const, name: 'web_search' as const })
  if (options.includeImageSearch) tools.push(SEARCH_IMAGE_TOOL)
  if (options.includeBriefingTools) tools.push(GET_WEATHER_TOOL, GET_NEWS_TOOL)
  if (options.includeScreenshotTool) tools.push(CAPTURE_SCREENSHOT_TOOL)

  const working = [...messages]
  const taskActions: string[] = []
  let imageDataUri: string | null = null

  const emitEvents = options.emitHudEvents ?? false

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (emitEvents) emitHudState('thinking')
    const response = await client.beta.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      betas: ['mcp-client-2025-11-20'],
      system: options.system,
      tools,
      mcp_servers: mcpServers,
      messages: working
    })

    working.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use'
    )
    const mcpToolUseBlocks = response.content.filter(
      (block): block is Anthropic.Beta.BetaMCPToolUseBlock => block.type === 'mcp_tool_use'
    )
    for (const block of [...toolUseBlocks, ...mcpToolUseBlocks]) {
      const label = extractTaskActionLabel(block.name, block.input)
      if (label) taskActions.push(label)
    }

    if (toolUseBlocks.length === 0) {
      if (emitEvents) emitHudState('responding')
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return { text, messages: working, taskActions, imageDataUri }
    }

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const toolUse of toolUseBlocks) {
      const result = await executeClientTool(toolUse.name, toolUse.input as Record<string, unknown>, emitEvents)
      const content =
        result.feedImageToModel && result.imageDataUri
          ? [imageBlockFromDataUri(result.imageDataUri), { type: 'text' as const, text: result.text }]
          : result.text
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content })
      if (result.imageDataUri) imageDataUri = result.imageDataUri
    }
    working.push({ role: 'user', content: toolResults })
  }

  return {
    text: "Désolé, je n'ai pas réussi à terminer cette demande (trop d'étapes).",
    messages: working,
    taskActions,
    imageDataUri
  }
}

function extractTaskActionLabel(toolName: string, input: unknown): string | null {
  if (!/create/i.test(toolName)) return null
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>
    const label = obj.title ?? obj.name ?? obj.summary
    if (typeof label === 'string' && label.trim()) return label.trim()
  }
  return toolName
}
