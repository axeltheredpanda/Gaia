import type Anthropic from '@anthropic-ai/sdk'
import { LINEAR_MCP_URL, getLinearAuthorizationToken } from './linearAuth'

export async function getLinearMcpServer(): Promise<Anthropic.Beta.BetaRequestMCPServerURLDefinition | null> {
  const token = await getLinearAuthorizationToken()
  if (!token) return null
  return { type: 'url', name: 'linear', url: LINEAR_MCP_URL, authorization_token: token }
}
