import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from './client'
import { SYSTEM_PROMPT } from './systemPrompt'

const history: Anthropic.MessageParam[] = []

export async function sendChat(userText: string): Promise<string> {
  const client = getClaudeClient()
  history.push({ role: 'user', content: userText })

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: history
  })

  history.push({ role: 'assistant', content: response.content })

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}
