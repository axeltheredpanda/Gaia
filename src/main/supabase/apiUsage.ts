import { getSupabaseClient, isSupabaseConfigured } from './client'

// $/1M tokens, tarifs standard (spec 8.10) — la remise d'intro Sonnet 5 n'est pas modélisée,
// ce log vise la visibilité, pas une facturation au centime près.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 }
}
const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_5M_MULTIPLIER = 1.25
const CACHE_WRITE_1H_MULTIPLIER = 2

export interface UsageLike {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null
}

function computeCostUsd(model: string, usage: UsageLike): number {
  const price = PRICING[model] ?? PRICING['claude-sonnet-5']
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const write5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      cacheRead * price.input * CACHE_READ_MULTIPLIER +
      write5m * price.input * CACHE_WRITE_5M_MULTIPLIER +
      write1h * price.input * CACHE_WRITE_1H_MULTIPLIER) /
    1e6
  )
}

/** Best-effort, jamais bloquant pour l'appel qu'il mesure (spec 8.10). */
export async function logApiUsage(label: string, model: string, usage: UsageLike): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const supabase = getSupabaseClient()
    await supabase.from('api_usage_log').insert({
      label,
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cache_write_5m_tokens: usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
      cache_write_1h_tokens: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
      cost_usd: computeCostUsd(model, usage)
    })
  } catch (error) {
    console.error('Log usage API échoué', error)
  }
}

export async function getTodayCostUsd(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const { data, error } = await supabase.from('api_usage_log').select('cost_usd').gte('created_at', startOfDay.toISOString())
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0)
}
