import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { getLinearMcpServer } from '../mcp/linear'
import { getGoogleTasksTools, callGoogleTasksTool } from '../mcp/googleTasksClient'
import { searchImage } from '../tools/imageSearch'

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

export interface ToolLoopOptions {
  model: string
  maxTokens: number
  system?: Anthropic.Beta.BetaTextBlockParam[]
  includeWebSearch?: boolean
  includeImageSearch?: boolean
}

export interface ToolLoopResult {
  text: string
  messages: Anthropic.Beta.BetaMessageParam[]
  taskActions: string[]
  imageDataUri: string | null
}

async function executeClientTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ text: string; imageDataUri?: string }> {
  if (name === 'search_image') {
    const result = await searchImage(input.query as string)
    return { text: result.toolResultText, imageDataUri: result.imageDataUri }
  }
  return { text: await callGoogleTasksTool(name, input) }
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
  const mcpServers = [await getLinearMcpServer()].filter((server) => server !== null)
  const googleTasksTools = await getGoogleTasksTools().catch(() => [])

  const tools: Anthropic.Beta.BetaToolUnion[] = [...googleTasksTools]
  if (options.includeWebSearch) tools.push({ type: 'web_search_20250305' as const, name: 'web_search' as const })
  if (options.includeImageSearch) tools.push(SEARCH_IMAGE_TOOL)

  const working = [...messages]
  const taskActions: string[] = []
  let imageDataUri: string | null = null

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
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
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return { text, messages: working, taskActions, imageDataUri }
    }

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const toolUse of toolUseBlocks) {
      const result = await executeClientTool(toolUse.name, toolUse.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.text })
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
