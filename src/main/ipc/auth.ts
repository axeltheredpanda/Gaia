import { ipcMain } from 'electron'
import { connectLinear, isLinearConnected } from '../mcp/linearAuth'
import { isGoogleTasksConnected } from '../mcp/googleTasksClient'

export function registerAuthIpc(): void {
  ipcMain.handle('auth:linear:connect', async () => {
    await connectLinear()
  })
  ipcMain.handle('auth:linear:status', async () => isLinearConnected())
  ipcMain.handle('auth:googleTasks:status', async () => isGoogleTasksConnected())
}
