import { desktopCapturer } from 'electron'

export interface ScreenshotResult {
  text: string
  imageDataUri?: string
}

const CAPTURE_SIZE = { width: 1600, height: 1000 }

/**
 * Capture d'écran à la demande (spec 8.7) : jamais en tâche de fond — cet outil n'est
 * jamais proposé au job de badge HUD, uniquement à la boucle de chat interactive.
 */
export async function captureScreenshot(target: 'active_window' | 'screen'): Promise<ScreenshotResult> {
  const types: ('screen' | 'window')[] = target === 'active_window' ? ['window'] : ['screen']
  const sources = await desktopCapturer.getSources({ types, thumbnailSize: CAPTURE_SIZE }).catch(() => [])

  if (sources.length === 0) {
    return {
      text:
        "Capture d'écran impossible : aucune source disponible. Sur macOS, vérifiez Réglages → Confidentialité et sécurité → Enregistrement d'écran, et autorisez Gaia (redémarrage de l'app requis après activation)."
    }
  }

  // ponytail: pas d'API Electron multiplateforme pour "la fenêtre active" — Chromium ordonne
  // les sources par z-order, la première étant en pratique la plus récemment au premier plan.
  const source = sources[0]
  if (source.thumbnail.isEmpty()) {
    return { text: "Capture d'écran impossible : image vide." }
  }

  return {
    text: `Capture d'écran (${target === 'active_window' ? 'fenêtre active' : 'écran entier'}) transmise ci-dessus.`,
    imageDataUri: source.thumbnail.toDataURL()
  }
}
