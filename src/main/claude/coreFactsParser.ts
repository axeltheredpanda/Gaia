import { getClaudeClient } from './client'
import { upsertCoreFact } from '../supabase/memory'
import { logApiUsage } from '../supabase/apiUsage'

const PARSE_TOOL = {
  name: 'record_core_facts',
  description:
    "Extrait des faits durables structurés (identité, métier, projets, contexte personnel) à partir d'un texte libre.",
  input_schema: {
    type: 'object' as const,
    properties: {
      facts: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            category: {
              type: 'string' as const,
              description: 'ex: identité, travail, projets, contexte personnel, habitudes'
            },
            content: { type: 'string' as const, description: 'Le fait, en une phrase claire et autonome' }
          },
          required: ['category', 'content']
        }
      }
    },
    required: ['facts']
  }
}

/**
 * Onboarding et zone de texte libre du profil uniquement — écrit toujours en tier core
 * (upsertCoreFact le code en dur), toujours en création, pas de dédup contre l'existant :
 * la correction se fait via l'édition manuelle de la liste dans l'écran profil.
 */
export async function parseFreeTextToCoreFacts(freeText: string): Promise<void> {
  const client = getClaudeClient()
  const model = 'claude-haiku-4-5-20251001'
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [PARSE_TOOL],
    tool_choice: { type: 'tool', name: 'record_core_facts' },
    messages: [{ role: 'user', content: `Découpe ce texte en faits durables distincts, un fait par idée :\n\n${freeText}` }]
  })
  void logApiUsage('core_facts_parse', model, response.usage)

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return

  const input = toolUse.input as { facts?: { category: string; content: string }[] }
  for (const fact of input.facts ?? []) {
    await upsertCoreFact({ category: fact.category, content: fact.content })
  }
}
