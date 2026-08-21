import type Anthropic from '@anthropic-ai/sdk'
import { runToolLoop } from './toolLoop'
import { getCurrentDateTimeLine } from './datetime'
import { setHudBadge } from '../supabase/hudCache'
import { isSupabaseConfigured } from '../supabase/client'
import { getCoreFactsBlock } from '../supabase/memory'
import { getWeatherCityOverride } from '../supabase/settings'

const REFRESH_INTERVAL_MS = 12 * 60 * 1000 // 12 min, dans la fourchette 10-15 min de la spec 4.6

const BADGE_PROMPT =
  'En une phrase très courte (12 mots maximum, segments séparés par " · "), résume : le nombre de tâches à faire aujourd’hui (Linear + Google Tasks), la météo du jour (get_weather), et un titre d’actu marquant s’il y en a un (get_news). Exemple : "3 tâches · 18°C nuageux · Marchés en hausse".'

async function refreshHudBadgeOnce(): Promise<void> {
  try {
    const [coreBlock, cityOverride] = await Promise.all([getCoreFactsBlock(), getWeatherCityOverride()])

    const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: getCurrentDateTimeLine() }]
    if (cityOverride) system.push({ type: 'text', text: `Ville pour la météo : ${cityOverride}` })
    else if (coreBlock) system.push({ type: 'text', text: `Faits sur l'utilisateur (pour en déduire sa ville) :\n${coreBlock}` })

    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: BADGE_PROMPT }]
    const { text } = await runToolLoop(messages, {
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 300,
      system,
      includeWebSearch: false,
      includeBriefingTools: true
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
