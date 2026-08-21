import type Anthropic from '@anthropic-ai/sdk'
import { GOOGLE_CALENDAR_MCP_URL, getGoogleCalendarAuthorizationToken } from './googleCalendarAuth'

export async function getGoogleCalendarMcpServer(): Promise<Anthropic.Beta.BetaRequestMCPServerURLDefinition | null> {
  const token = await getGoogleCalendarAuthorizationToken()
  if (!token) return null
  return { type: 'url', name: 'google_calendar', url: GOOGLE_CALENDAR_MCP_URL, authorization_token: token }
}
