import type Anthropic from '@anthropic-ai/sdk'

export type Attachment =
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  | { kind: 'pdf'; data: string }

/** Vision (spec 8.4) + PDF natif (spec 8.5) : content blocks gérés nativement par l'API Claude. */
export function buildUserContent(
  userText: string,
  attachments: Attachment[] | undefined
): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (!attachments || attachments.length === 0) return userText

  const blocks: Anthropic.Beta.BetaContentBlockParam[] = attachments.map((att) =>
    att.kind === 'image'
      ? { type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } }
  )
  // l'API rejette un bloc texte vide : ne l'ajouter que si Axel a effectivement écrit quelque chose
  if (userText.trim()) blocks.push({ type: 'text', text: userText })
  return blocks
}
