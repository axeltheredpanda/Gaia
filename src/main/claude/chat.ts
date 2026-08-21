import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { SYSTEM_PROMPT } from './systemPrompt'
import { getLinearMcpServer } from '../mcp/linear'
import { getGoogleTasksTools, callGoogleTasksTool } from '../mcp/googleTasksClient'

const history: Anthropic.Beta.BetaMessageParam[] = []

const MAX_TOOL_ITERATIONS = 5

export async function sendChat(userText: string): Promise<string> {
  const client = getClaudeClient()
  history.push({ role: 'user', content: userText })

  const mcpServers = [getLinearMcpServer()].filter((server) => server !== null)
  const googleTasksTools = await getGoogleTasksTools().catch(() => [])

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.beta.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      betas: ['mcp-client-2025-11-20'],
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }, ...googleTasksTools],
      mcp_servers: mcpServers,
      messages: history
    })

    history.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use'
    )

    if (toolUseBlocks.length === 0) {
      return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
    }

    const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const toolUse of toolUseBlocks) {
      const text = await callGoogleTasksTool(toolUse.name, toolUse.input as Record<string, unknown>)
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: text })
    }
    history.push({ role: 'user', content: toolResults })
  }

  return "Désolé, je n'ai pas réussi à terminer cette demande (trop d'étapes)."
}
