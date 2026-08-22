import { nodewhisper } from 'nodejs-whisper'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)

// 'base' (multilingue) : compromis latence/précision retenu pour le push-to-talk (spec V2 vocal) —
// 'tiny' est plus rapide mais nettement moins précis en français, 'small' est ~3x plus lourd pour
// un gain de précision qui compte peu pour de courtes requêtes vocales. Changeable ici si l'usage
// réel montre que 'small' vaut le coût (non mesuré en conditions réelles dans ce sandbox — réseau
// bloqué, voir le paragraphe dédié dans docs/PROJECT_SPEC.md).
const MODEL = 'base'

/**
 * Transcrit un enregistrement micro (push-to-talk). `rawAudio` est le format brut produit par
 * MediaRecorder côté renderer (webm/opus) — converti en WAV 16 kHz mono via ffmpeg (prérequis
 * externe, comme whisper.cpp et Piper) avant d'être passé à whisper.cpp.
 *
 * whisper-cli écrit le texte propre (un segment par ligne, sans horodatage) dans <fichier>.txt —
 * la valeur de retour de nodewhisper() est la sortie console brute (verbeuse, avec horodatages),
 * pas le transcript ; lire le fichier .txt est la seule façon fiable d'obtenir du texte propre
 * (vérifié directement dans le code source de whisper.cpp, cli.cpp::output_txt).
 */
export async function transcribeAudio(rawAudio: Buffer): Promise<string> {
  if (rawAudio.length < 2000) {
    throw new Error('Enregistrement trop court — maintiens le micro au moins 1 seconde.')
  }

  const id = randomUUID()
  const rawPath = join(tmpdir(), `gaia-ptt-${id}.webm`)
  const wavPath = join(tmpdir(), `gaia-ptt-${id}.wav`)
  const txtPath = `${wavPath}.txt`

  await writeFile(rawPath, rawAudio)
  try {
    await execFileAsync('ffmpeg', ['-nostats', '-loglevel', 'error', '-y', '-i', rawPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath])

    await nodewhisper(wavPath, {
      modelName: MODEL,
      autoDownloadModelName: MODEL,
      removeWavFileAfterTranscription: true,
      whisperOptions: { outputInText: true, language: 'fr' }
    })
    const text = await readFile(txtPath, 'utf-8')
    const cleaned = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
    if (!cleaned) {
      throw new Error('Aucune parole détectée — parle plus fort ou maintiens le micro un peu plus longtemps.')
    }
    return cleaned
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/too short|produced no output|Transcription failed/i.test(message)) {
      throw new Error('Enregistrement trop court ou inaudible — maintiens le micro 1–2 secondes en parlant.')
    }
    throw error
  } finally {
    await unlink(rawPath).catch(() => {})
    await unlink(wavPath).catch(() => {})
    await unlink(txtPath).catch(() => {})
  }
}
