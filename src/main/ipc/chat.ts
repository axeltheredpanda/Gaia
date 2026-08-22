import { ipcMain } from 'electron'

import { sendChat } from '../claude/chat'

import type { Attachment } from '../claude/attachments'

import { routeModel, isCloudModel } from '../claude/router'

import { isOllamaAvailable } from '../ollama/client'

import { generateVoiceFiller } from '../ollama/filler'

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



      function notifyTtsError(message: string): void {

        event.sender.send('chat:ttsError', message)

      }



      function dispatchTts(sentence: string): void {

        ttsQueue = ttsQueue.then(async () => {

          const voiceName = await voiceNamePromise

          if (!voiceName) {

            notifyTtsError('Voix Piper non configurée — Paramètres → VOIX → fr_FR-siwis-medium')

            return

          }

          try {

            const wav = await synthesizeSentence(sentence, voiceName)

            console.log(`[Piper] synthèse OK (${wav.byteLength} octets): ${sentence.slice(0, 60)}`)

            const arrayBuffer = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)

            event.sender.send('chat:ttsAudio', arrayBuffer)

          } catch (error) {

            const message = error instanceof Error ? error.message : 'Synthèse Piper échouée'

            console.error('Synthèse Piper échouée', error)

            notifyTtsError(message)

          }

        })

      }



      if (isVoice) {

        void voiceNamePromise.then((voiceName) => {

          if (!voiceName) notifyTtsError('Voix Piper non configurée — Paramètres → VOIX → fr_FR-siwis-medium')

        })



        const model = routeModel(userText, {

          hasAttachments: (attachments?.length ?? 0) > 0,

          ollamaAvailable: isOllamaAvailable()

        })

        if (isCloudModel(model)) {

          void generateVoiceFiller().then((filler) => {

            if (filler.trim()) dispatchTts(filler)

          })

        }

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

