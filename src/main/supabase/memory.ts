import { getSupabaseClient, isSupabaseConfigured } from './client'

export interface MemoryFact {
  id: number
  category: string | null
  content: string
}

function formatFactsBlock(facts: MemoryFact[]): string | null {
  if (facts.length === 0) return null
  return facts.map((f) => `- ${f.category ? `[${f.category}] ` : ''}${f.content}`).join('\n')
}

export async function getCoreFacts(): Promise<MemoryFact[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('memory_facts')
    .select('id, category, content')
    .eq('tier', 'core')
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Injecté intégralement et systématiquement dans le system prompt (spec : jamais filtré, jamais omis). */
export async function getCoreFactsBlock(): Promise<string | null> {
  return formatFactsBlock(await getCoreFacts())
}

/** Premier lancement = aucun fait core en base. Sans Supabase configuré, l'onboarding n'a pas de sens. */
export async function hasCoreFacts(): Promise<boolean> {
  if (!isSupabaseConfigured()) return true
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from('memory_facts')
    .select('id', { count: 'exact', head: true })
    .eq('tier', 'core')
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'au', 'aux', 'en', 'pour', 'sur',
  'dans', 'avec', 'ce', 'cette', 'ces', 'que', 'qui', 'est', 'suis', 'ai', 'as', 'a', 'il', 'elle', 'je',
  'tu', 'nous', 'vous', 'ils', 'elles', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'se',
  'ne', 'pas', 'plus', 'bien', 'très', 'fait', 'faire'
])
const MAX_PERIPHERAL_RESULTS = 8

const DIACRITICS = /[\u0300-\u036f]/g

function normalize(text: string): string {
  // NFD + suppression des marques diacritiques : accents ignorés pour un matching plus robuste
  return text.toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      normalize(text)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    )
  )
}

/** Matching par mots-clés simple — pas de recherche sémantique/pgvector pour cette V1 (à revoir si insuffisant à l'usage). */
export async function getPeripheralFactsForQuery(
  queryText: string
): Promise<(MemoryFact & { id: number })[]> {
  if (!isSupabaseConfigured()) return []
  const keywords = extractKeywords(queryText)
  if (keywords.length === 0) return []

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('memory_facts')
    .select('id, category, content')
    .eq('tier', 'peripheral')
  if (error) throw new Error(error.message)

  const matches = (data ?? []).filter((fact) => {
    if (fact.category === 'style_interaction') return false
    const haystack = normalize(`${fact.category ?? ''} ${fact.content}`)
    return keywords.some((word) => haystack.includes(word))
  })
  return matches.slice(0, MAX_PERIPHERAL_RESULTS)
}

export async function getPeripheralFactsBlock(queryText: string): Promise<string | null> {
  return formatFactsBlock(await getPeripheralFactsForQuery(queryText))
}

/** style_interaction : injecté intégralement à chaque requête (pas de matching par mots-clés). */
export async function getStyleInteractionFacts(): Promise<MemoryFact[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('memory_facts')
    .select('id, category, content')
    .eq('tier', 'peripheral')
    .eq('category', 'style_interaction')
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getStyleInteractionFactsBlock(): Promise<string | null> {
  return formatFactsBlock(await getStyleInteractionFacts())
}

export async function listPeripheralFactsForExtraction(): Promise<MemoryFact[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('memory_facts')
    .select('id, category, content')
    .eq('tier', 'peripheral')
    .order('id', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Extraction automatique uniquement — tier codé en dur à 'peripheral', garde-fou sur les updates. */
export async function upsertPeripheralFact(fact: {
  id?: number
  category: string | null
  content: string
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  if (fact.id) {
    const { error } = await supabase
      .from('memory_facts')
      .update({ category: fact.category, content: fact.content, updated_at: new Date().toISOString() })
      .eq('id', fact.id)
      .eq('tier', 'peripheral')
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('memory_facts')
      .insert({ category: fact.category, content: fact.content, tier: 'peripheral' })
    if (error) throw new Error(error.message)
  }
}

/** Onboarding + édition manuelle du profil uniquement — tier codé en dur à 'core'. */
export async function upsertCoreFact(fact: {
  id?: number
  category: string | null
  content: string
}): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  if (fact.id) {
    const { error } = await supabase
      .from('memory_facts')
      .update({ category: fact.category, content: fact.content, updated_at: new Date().toISOString() })
      .eq('id', fact.id)
      .eq('tier', 'core')
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('memory_facts')
      .insert({ category: fact.category, content: fact.content, tier: 'core' })
    if (error) throw new Error(error.message)
  }
}

export async function deleteFact(id: number): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('memory_facts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
