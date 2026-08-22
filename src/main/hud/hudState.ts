import type { BrowserWindow } from 'electron'

export type HudState = 'idle' | 'listening' | 'thinking' | 'responding'

let win: BrowserWindow | null = null

export function registerHudStateWindow(window: BrowserWindow): void {
  win = window
}

/** Un seul flux d'événements pour le label ET l'animation côté renderer (spec 8.2) — pas deux systèmes séparés. */
export function emitHudState(state: HudState, detail?: string): void {
  win?.webContents.send('hud:state', { state, detail })
}

/** Maîtrise des coûts (spec 8.10) : le job de badge HUD en tâche de fond ne doit tourner que fenêtre ouverte + au premier plan. */
export function isMainWindowFocused(): boolean {
  return win !== null && !win.isDestroyed() && win.isFocused()
}
