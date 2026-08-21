import { ipcMain } from 'electron'
import { connectLinear, isLinearConnected } from '../mcp/linearAuth'

export function registerAuthIpc(): void {
  ipcMain.handle('auth:linear:connect', async () => {
    await connectLinear()
  })
  ipcMain.handle('auth:linear:status', async () => isLinearConnected())
}
