import { getSupabaseClient, isSupabaseConfigured } from './client'

export async function getHudBadge(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('hud_cache').select('summary').eq('id', 'default').maybeSingle()
  if (error) throw new Error(error.message)
  return data?.summary ?? null
}

export async function setHudBadge(summary: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('hud_cache')
    .upsert({ id: 'default', summary, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
