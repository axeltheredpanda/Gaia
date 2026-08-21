import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from './toolLoop'
import { setHudBadge } from '../supabase/hudCache'
import { isSupabaseConfigured } from '../supabase/client'

const REFRESH_INTERVAL_MS = 12 * 60 * 1000 // 12 min, dans la fourchette 10-15 min de la spec 4.6

const BADGE_PROMPT =
  'En 5 mots maximum, résume le nombre de tâches à faire aujourd’hui (Linear + Google Tasks). Exemple : "3 tâches aujourd’hui".'

async function refreshHudBadgeOnce(): Promise<void> {
  try {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: BADGE_PROMPT }]
    const { text } = await runToolLoop(messages, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 200,
      includeWebSearch: false
    })
    if (text.trim()) await setHudBadge(text.trim())
  } catch (error) {
    // best-effort : le badge garde son ancienne valeur si le rafraîchissement échoue
    console.error('Échec du rafraîchissement du badge HUD', error)
  }
}

export function startHudBadgeRefreshLoop(): void {
  if (!isSupabaseConfigured()) return
  void refreshHudBadgeOnce()
  setInterval(() => void refreshHudBadgeOnce(), REFRESH_INTERVAL_MS)
}
