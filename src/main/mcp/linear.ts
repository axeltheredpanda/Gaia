import type Anthropic from '@anthropic-ai/sdk'
import { LINEAR_MCP_URL, getLinearAuthorizationToken } from './linearAuth'

export function getLinearMcpServer(): Anthropic.Beta.BetaRequestMCPServerURLDefinition | null {
  const token = getLinearAuthorizationToken()
  if (!token) return null
  return { type: 'url', name: 'linear', url: LINEAR_MCP_URL, authorization_token: token }
}
