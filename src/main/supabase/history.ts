import type Anthropic from '@anthropic-ai/sdk'
import { getSupabaseClient, isSupabaseConfigured } from './client'

const WINDOW_SIZE = 20

type StoredContent = Anthropic.Beta.BetaMessageParam['content']
type StoredMessage = { role: 'user' | 'assistant'; content: StoredContent }

/** Retire les blocs tool loop — invalides seuls et inutiles au rejeu du contexte. */
function sanitizeHistoryForApi(messages: Anthropic.Beta.BetaMessageParam[]): Anthropic.Beta.BetaMessageParam[] {
  const cleaned: Anthropic.Beta.BetaMessageParam[] = []
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      if (msg.content.trim()) cleaned.push(msg)
      continue
    }
    if (msg.role === 'user') {
      const blocks = msg.content.filter((block) => block.type !== 'tool_result')
      if (blocks.length === 0) continue
      cleaned.push({ role: 'user', content: blocks })
      continue
    }
    if (msg.role === 'assistant') {
      const textBlocks = msg.content.filter((block) => block.type === 'text')
      if (textBlocks.length === 0) continue
      cleaned.push({ role: 'assistant', content: textBlocks })
    }
  }
  return cleaned
}

/** Contenu persistable : jamais les étapes intermédiaires tool_use / tool_result. */
export function contentForPersistence(
  role: 'user' | 'assistant',
  content: StoredContent
): StoredContent | null {
  if (typeof content === 'string') return content.trim() ? content : null
  if (role === 'user') {
    const blocks = content.filter((block) => block.type !== 'tool_result')
    return blocks.length > 0 ? blocks : null
  }
  const textBlocks = content.filter((block) => block.type === 'text')
  return textBlocks.length > 0 ? textBlocks : null
}

/** Utilisée tant que Supabase n'est pas configuré : pas de persistance entre lancements, mais le chat reste fonctionnel. */
const inMemoryFallback: StoredMessage[] = []

export async function appendMessage(role: 'user' | 'assistant', content: StoredContent): Promise<void> {
  if (!isSupabaseConfigured()) {
    inMemoryFallback.push({ role, content })
    return
  }
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('conversation_messages').insert({ role, content })
  if (error) throw new Error(error.message)
}

export async function loadRecentHistory(): Promise<Anthropic.Beta.BetaMessageParam[]> {
  if (!isSupabaseConfigured()) {
    return sanitizeHistoryForApi(inMemoryFallback.slice(-WINDOW_SIZE))
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('role, content')
    .order('id', { ascending: false })
    .limit(WINDOW_SIZE)
  if (error) throw new Error(error.message)
  return sanitizeHistoryForApi(
    (data ?? []).reverse().map((row) => ({ role: row.role, content: row.content }))
  )
}

export async function getConversationSummary(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('conversation_summary')
    .select('summary')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.summary ?? null
}

