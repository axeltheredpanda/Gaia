import { getSupabaseClient, isSupabaseConfigured } from './client'

/** Secrets OAuth via Supabase Vault (spec 4.6) — jamais en clair dans une table classique. */
export async function setSecret(name: string, value: string): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('gaia_set_secret', { secret_name: name, secret_value: value })
  if (error) throw new Error(error.message)
}

export async function getSecret(name: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('gaia_get_secret', { secret_name: name })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}
