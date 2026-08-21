import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY manquante (voir .env.example)')
    }
    client = new Anthropic({ apiKey })
  }
  return client
}
