import type Anthropic from '@anthropic-ai/sdk'
import { getSupabaseClient, isSupabaseConfigured } from './client'
import { getClaudeClient } from '../claude/client'

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

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block !== 'object' || block === null) return ''
        if ('text' in block) return String((block as { text: unknown }).text)
        if ('type' in block) return `[${(block as { type: string }).type}]`
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

/** Au-delà de la fenêtre glissante, résume les messages plus anciens via Haiku (spec 4.6). */
export async function maybeSummarize(): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()

  const { data: latest, error: latestError } = await supabase
    .from('conversation_messages')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
  if (latestError) throw new Error(latestError.message)
  const maxId = latest?.[0]?.id
  if (!maxId) return

  const cutoff = maxId - WINDOW_SIZE
  if (cutoff <= 0) return

  const { data: summaryRow, error: summaryError } = await supabase
    .from('conversation_summary')
    .select('summary, summarized_through_message_id')
    .eq('id', 'default')
    .maybeSingle()
  if (summaryError) throw new Error(summaryError.message)

  const summarizedThrough = summaryRow?.summarized_through_message_id ?? 0
  if (cutoff <= summarizedThrough) return

  const { data: toSummarize, error: rangeError } = await supabase
    .from('conversation_messages')
    .select('id, role, content')
    .gt('id', summarizedThrough)
    .lte('id', cutoff)
    .order('id', { ascending: true })
  if (rangeError) throw new Error(rangeError.message)
  if (!toSummarize || toSummarize.length === 0) return

  const transcript = toSummarize.map((m) => `${m.role}: ${extractText(m.content)}`).join('\n')
  const previousSummary = summaryRow?.summary
  const prompt = previousSummary
    ? `Résumé précédent : ${previousSummary}\n\nNouveaux messages à intégrer :\n${transcript}`
    : `Messages à résumer :\n${transcript}`

  const client = getClaudeClient()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Résume cette conversation avec Axel en quelques phrases factuelles et denses, pour mémoire de contexte interne (pas pour affichage direct). ${prompt}`
      }
    ]
  })
  const summaryText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const { error: upsertError } = await supabase.from('conversation_summary').upsert({
    id: 'default',
    summary: summaryText,
    summarized_through_message_id: cutoff,
    updated_at: new Date().toISOString()
  })
  if (upsertError) throw new Error(upsertError.message)
}
