import { ipcMain } from 'electron'
import { sendChat } from '../claude/chat'
import type { Attachment } from '../claude/attachments'
import { synthesizeSentence } from '../voice/tts'
import { getPiperVoiceName } from '../supabase/settings'

/** Découpage naïf par ponctuation forte + espace (spec V2 vocal) — suffisant pour la synthèse phrase par phrase, pas une segmentation linguistique complète. */
function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const parts = buffer.split(/(?<=[.!?])\s+/)
  const rest = parts.pop() ?? ''
  return { sentences: parts, rest }
}

export function registerChatIpc(): void {
  ipcMain.handle(
    'chat:send',
    async (event, userText: string, attachments: Attachment[] | undefined, isVoice: boolean | undefined) => {
      let sentenceBuffer = ''
      let ttsQueue = Promise.resolve()
      const voiceNamePromise = isVoice ? getPiperVoiceName().catch(() => null) : Promise.resolve(null)

      function dispatchTts(sentence: string): void {
        ttsQueue = ttsQueue.then(async () => {
          const voiceName = await voiceNamePromise
          if (!voiceName) return
          try {
            const wav = await synthesizeSentence(sentence, voiceName)
            const arrayBuffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)
            event.sender.send('chat:ttsAudio', arrayBuffer)
          } catch (error) {
            console.error('Synthèse Piper échouée', error)
          }
        })
      }

      const reply = await sendChat(userText, attachments, (delta) => {
        event.sender.send('chat:textChunk', delta)
        if (!isVoice) return
        sentenceBuffer += delta
        const { sentences, rest } = extractSentences(sentenceBuffer)
        sentenceBuffer = rest
        for (const sentence of sentences) {
          if (sentence.trim()) dispatchTts(sentence)
        }
      })

      if (isVoice && sentenceBuffer.trim()) dispatchTts(sentenceBuffer)
      return reply
    }
  )
}
