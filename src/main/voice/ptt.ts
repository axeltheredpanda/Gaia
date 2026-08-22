import { uIOhook, UiohookKey } from 'uiohook-napi'
import type { BrowserWindow } from 'electron'
import { getPttShortcutKey } from '../supabase/settings'

const DEFAULT_KEY = 'F9'

/**
 * Push-to-talk global (spec V2 vocal 1) : contrairement au raccourci mic dans le HUD (pointerdown/up
 * DOM natif), un raccourci système fonctionnant même hors focus de l'app nécessite un hook clavier
 * bas niveau — Electron globalShortcut ne fournit que des déclenchements ponctuels, pas keydown/keyup
 * pour un vrai maintien. uiohook-napi fournit ça avec des binaires précompilés (macOS/Windows/Linux),
 * sans étape de compilation côté utilisateur.
 *
 * Permission macOS requise : Réglages système → Confidentialité et sécurité → Surveillance des
 * saisies (Input Monitoring), sinon uIOhook ne reçoit aucun événement (pas d'erreur bruyante).
 */
export async function startPushToTalkListener(win: BrowserWindow): Promise<void> {
  const keyName = (await getPttShortcutKey().catch(() => null)) ?? DEFAULT_KEY
  const keycode = (UiohookKey as Record<string, number>)[keyName] ?? UiohookKey.F9

  let pressed = false
  uIOhook.on('keydown', (e) => {
    if (e.keycode !== keycode || pressed) return
    pressed = true
    win.webContents.send('ptt:start')
  })
  uIOhook.on('keyup', (e) => {
    if (e.keycode !== keycode || !pressed) return
    pressed = false
    win.webContents.send('ptt:stop')
  })
  uIOhook.start()
}
