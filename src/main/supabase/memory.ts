import { getSupabaseClient, isSupabaseConfigured } from './client'

/** Bloc mémoire compact des faits durables sur l'utilisateur (spec 4.6) — vide tant que rien n'a été mémorisé. */
export async function getMemoryFactsBlock(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('memory_facts').select('fact').order('id', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return null
  return data.map((row) => `- ${row.fact}`).join('\n')
}
