import { ipcMain } from 'electron'
import { getHudBadge } from '../supabase/hudCache'

export function registerHudIpc(): void {
  ipcMain.handle('hud:badge', async () => getHudBadge())
}
