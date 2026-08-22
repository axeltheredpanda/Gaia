import type Anthropic from '@anthropic-ai/sdk'
import { getSupabaseClient, isSupabaseConfigured } from './client'

const WINDOW_SIZE = 20

type StoredContent = Anthropic.Beta.BetaMessageParam['content']
type StoredMessage = { role: 'user' | 'assistant'; content: StoredContent }

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
    return inMemoryFallback.slice(-WINDOW_SIZE)
  }
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('role, content')
    .order('id', { ascending: false })
    .limit(WINDOW_SIZE)
  if (error) throw new Error(error.message)
  return (data ?? []).reverse().map((row) => ({ role: row.role, content: row.content }))
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

