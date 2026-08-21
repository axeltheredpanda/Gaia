import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { SYSTEM_PROMPT } from './systemPrompt'
import { getLinearMcpServer } from '../mcp/linear'

const history: Anthropic.Beta.BetaMessageParam[] = []

export async function sendChat(userText: string): Promise<string> {
  const client = getClaudeClient()
  history.push({ role: 'user', content: userText })

  const mcpServers = [getLinearMcpServer()].filter((server) => server !== null)

  const response = await client.beta.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    betas: ['mcp-client-2025-11-20'],
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    mcp_servers: mcpServers,
    messages: history
  })

  history.push({ role: 'assistant', content: response.content })

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}
