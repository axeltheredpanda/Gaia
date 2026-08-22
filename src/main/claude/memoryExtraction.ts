import { getClaudeClient } from './client'
import { listPeripheralFactsForExtraction, upsertPeripheralFact } from '../supabase/memory'
import { isSupabaseConfigured } from '../supabase/client'
import { logApiUsage } from '../supabase/apiUsage'

const RECORD_TOOL = {
  name: 'record_peripheral_facts',
  description:
    "Enregistre des faits peripheral durables détectés dans l'échange (jamais tier core).",
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
              description:
                'Catégorie libre (ex: habitudes, personnes, projets) ou style_interaction pour une préférence sur comment Gaia doit parler/répondre'
            },
            content: { type: 'string' as const, description: 'Le fait, en une phrase claire et autonome' },
            update_id: {
              type: 'number' as const,
              description: "ID d'un fait peripheral existant à mettre à jour, si applicable"
            }
          },
          required: ['category', 'content']
        }
      }
    },
    required: ['facts']
  }
}

/**
 * Extraction peripheral après chaque échange — inclut les préférences d'interaction (style_interaction).
 * Best-effort, jamais bloquant pour le chat.
 */
export async function extractPeripheralFactsAfterExchange(
  userText: string,
  assistantText: string
): Promise<void> {
  if (!isSupabaseConfigured()) return

  const existing = await listPeripheralFactsForExtraction()
  const existingLines =
    existing.length > 0
      ? existing.map((f) => `- id=${f.id} [${f.category ?? 'sans catégorie'}] ${f.content}`).join('\n')
      : '(aucun fait peripheral connu)'

  const client = getClaudeClient()
  const model = 'claude-haiku-4-5-20251001'
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    tools: [RECORD_TOOL],
    tool_choice: { type: 'tool', name: 'record_peripheral_facts' },
    messages: [
      {
        role: 'user',
        content: `Analyse cet échange et décide s'il contient un fait durable à mémoriser en tier peripheral.

Cherche deux types de signaux :
1. Faits factuels/biographiques sur Axel (habitudes, personnes, projets, préférences générales) — catégories libres.
2. Préférences d'interaction (category = style_interaction) : comment Axel veut que Gaia lui parle (réponses courtes/longues, ton, éviter les questions en rafale, aller droit au but, etc.).

N'enregistre que ce qui est clairement durable et utile plus tard. Si rien de nouveau, renvoie facts: [].

Faits peripheral déjà connus :
${existingLines}

Échange :
Axel : ${userText}
Gaia : ${assistantText}`
      }
    ]
  })
  void logApiUsage('memory_extract', model, response.usage)

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') return

  const input = toolUse.input as {
    facts?: { category: string; content: string; update_id?: number }[]
  }
  for (const fact of input.facts ?? []) {
    if (!fact.content?.trim()) continue
    await upsertPeripheralFact({
      id: fact.update_id,
      category: fact.category?.trim() || null,
      content: fact.content.trim()
    })
  }
}
