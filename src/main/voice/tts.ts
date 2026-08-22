import { spawn, type ChildProcess } from 'node:child_process'

// Port local fixe, jamais exposé hors localhost — même esprit que le proxy PostgREST utilisé en
// test pour ce projet : un service local piloté par Gaia, pas un service réseau public.
const HOST = '127.0.0.1'
const PORT = 5959
const STARTUP_TIMEOUT_MS = 30_000

let serverProcess: ChildProcess | null = null
let readyPromise: Promise<void> | null = null

/**
 * Démarre `python3 -m piper.http_server` à la demande (spec V2 vocal 3) — jamais au lancement de
 * l'app, seulement au premier besoin de synthèse vocale (voix déclenchée par Axel). Le process
 * reste ensuite actif pour la session : http_server charge le modèle une seule fois puis répond
 * vite à chaque requête, contrairement au CLI piper qui recharge le modèle à chaque appel (voir
 * docs/CLI.md du projet Piper : "It can be slow […] because it needs to load the voice model each
 * time. For repeated use, the web server is recommended.").
 */
function ensureServerStarted(voiceName: string): Promise<void> {
  if (readyPromise) return readyPromise
  readyPromise = new Promise((resolve, reject) => {
    const proc = spawn('python3', ['-m', 'piper.http_server', '-m', voiceName, '--host', HOST, '--port', String(PORT)])
    serverProcess = proc
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(new Error('Piper : démarrage trop long (30s dépassées)'))
    }, STARTUP_TIMEOUT_MS)

    proc.stderr?.on('data', (chunk: Buffer) => {
      // Bannière de démarrage du serveur de développement Flask/werkzeug, sur stderr.
      if (!settled && /Running on/i.test(chunk.toString())) {
        settled = true
        clearTimeout(timeout)
        resolve()
      }
    })
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(err)
    })
    proc.on('exit', (code) => {
      serverProcess = null
      readyPromise = null
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(
          new Error(
            `Piper indisponible (code ${code}) — vérifiez que python3 et "pip install piper-tts[http]" sont installés, et que la voix "${voiceName}" est configurée (Paramètres → Briefing) et téléchargée via "python3 -m piper.download_voices ${voiceName}"`
          )
        )
      }
    })
  })
  return readyPromise
}

/** Une phrase → un WAV (spec V2 vocal 3 : synthèse phrase par phrase, pas d'attente du texte complet). */
export async function synthesizeSentence(text: string, voiceName: string): Promise<Buffer> {
  await ensureServerStarted(voiceName)
  const res = await fetch(`http://${HOST}:${PORT}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) throw new Error(`Piper : échec de synthèse (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export function stopTtsServer(): void {
  serverProcess?.kill()
  serverProcess = null
  readyPromise = null
}
