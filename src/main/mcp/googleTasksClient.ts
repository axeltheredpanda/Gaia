import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import type Anthropic from '@anthropic-ai/sdk'

const require = createRequire(import.meta.url)

let connecting: Promise<Client> | null = null

/**
 * google-tasks-mcp speaks stdio only, so it's spawned as a local subprocess and
 * driven with a client-side tool loop (see claude/chat.ts) — Anthropic's
 * mcp_servers connector requires a public HTTPS URL, which a local process
 * can never satisfy. Requires one-time `npx google-tasks-mcp auth` setup
 * (see README) before this can succeed.
 */
async function getClient(): Promise<Client> {
  if (!connecting) {
    connecting = (async () => {
      const entry = require.resolve('google-tasks-mcp/dist/index.js')
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [entry],
        env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: '1' }
      })
      const client = new Client({ name: 'gaia', version: '0.1.0' })
      await client.connect(transport)
      return client
    })()
  }
  return connecting
}

export async function getGoogleTasksTools(): Promise<Anthropic.Beta.BetaTool[]> {
  const client = await getClient()
  const { tools } = await client.listTools()
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema
  }))
}

export async function callGoogleTasksTool(name: string, input: Record<string, unknown>): Promise<string> {
  const client = await getClient()
  const result = await client.callTool({ name, arguments: input })
  const content = result.content as Array<{ type: string; text?: string }>
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Le sous-processus démarre et liste ses outils qu'il y ait ou non des
 * credentials (vérifié en test) : le seul signal fiable de connexion réelle
 * est la présence du token OAuth écrit par `npx google-tasks-mcp auth`.
 */
export function isGoogleTasksConnected(): boolean {
  const dir = process.env.GTASKS_MCP_DIR ?? join(homedir(), '.config', 'google-tasks-mcp')
  const tokenPath = process.env.GTASKS_MCP_TOKEN ?? join(dir, 'token.json')
  return existsSync(tokenPath)
}
