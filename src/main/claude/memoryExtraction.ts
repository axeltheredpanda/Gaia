import { getClaudeClient } from './client'
import { getPeripheralFactsForQuery, upsertPeripheralFact } from '../supabase/memory'
import { isSupabaseConfigured } from '../supabase/client'

const EXTRACT_TOOL = {
  name: 'update_memory',
  description:
    "Enregistre ou met à jour des faits durables sur Axel (préférences, habitudes, projets, personnes mentionnées). N'appeler qu'avec des faits réellement durables — pas des détails ponctuels de la conversation.",
  input_schema: {
    type: 'object' as const,
    properties: {
      facts: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            id: {
              type: 'number' as const,
              description: "Id d'un fait existant à mettre à jour. Omettre pour créer un nouveau fait."
            },
            category: { type: 'string' as const, description: 'ex: travail, habitudes, personnes, préférences, projets' },
            content: { type: 'string' as const, description: 'Le fait, en une phrase' }
          },
          required: ['category', 'content']
        }
      }
    },
    required: ['facts']
  }
}

/**
 * Après chaque échange, en Haiku (non bloquant pour la réponse affichée) : détermine si un fait
 * durable doit être ajouté ou mis à jour. N'écrit jamais que du tier peripheral (spec : l'extraction
 * automatique ne doit jamais écrire ni modifier un fait core).
 */
export async function extractMemoryFacts(userText: string, assistantText: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const existing = await getPeripheralFactsForQuery(`${userText} ${assistantText}`)
  const existingBlock =
    existing.length > 0
      ? existing.map((f) => `- id=${f.id} [${f.category ?? '?'}] ${f.content}`).join('\n')
      : '(aucun)'

  const client = getClaudeClient()
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: 'tool', name: 'update_memory' },
    messages: [
      {
        role: 'user',
        content: `Échange récent :\nAxel : ${userText}\nGaia : ${assistantText}\n\nFaits peripheral existants proches du sujet :\n${existingBlock}\n\nY a-t-il un fait durable à mémoriser ou un fait existant à corriger ? Sinon renvoie une liste vide.`
      }
    ]
  })

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return

  const input = toolUse.input as { facts?: { id?: number; category: string; content: string }[] }
  for (const fact of input.facts ?? []) {
    await upsertPeripheralFact({ id: fact.id, category: fact.category, content: fact.content })
  }
}
