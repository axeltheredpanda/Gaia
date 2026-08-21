import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { getLinearMcpServer } from '../mcp/linear'
import { getGoogleTasksTools, callGoogleTasksTool } from '../mcp/googleTasksClient'

const MAX_TOOL_ITERATIONS = 5

export interface ToolLoopOptions {
  model: string
  maxTokens: number
  system?: Anthropic.Beta.BetaTextBlockParam[]
  includeWebSearch?: boolean
}

export interface ToolLoopResult {
  text: string
  messages: Anthropic.Beta.BetaMessageParam[]
}

/**
 * Boucle d'appel d'outils partagée par le chat et le rafraîchissement du badge HUD :
 * appelle l'API, exécute les tool_use côté client (Google Tasks) et boucle jusqu'à
 * une réponse finale. Linear passe par mcp_servers (exécuté côté serveur Anthropic).
 */
export async function runToolLoop(
  messages: Anthropic.Beta.BetaMessageParam[],
  options: ToolLoopOptions
): Promise<ToolLoopResult> {
  const client = getClaudeClient()
  const mcpServers = [await getLinearMcpServer()].filter((server) => server !== null)
  const googleTasksTools = await getGoogleTasksTools().catch(() => [])
  const tools = options.includeWebSearch
    ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const }, ...googleTasksTools]
    : googleTasksTools

  const working = [...messages]

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

    if (toolUseBlocks.length === 0) {
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      return { text, messages: working }
    }

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const toolUse of toolUseBlocks) {
      const text = await callGoogleTasksTool(toolUse.name, toolUse.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: text })
    }
    working.push({ role: 'user', content: toolResults })
  }

  return {
    text: "Désolé, je n'ai pas réussi à terminer cette demande (trop d'étapes).",
    messages: working
  }
}
