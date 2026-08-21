import { ipcMain } from 'electron'
import { connectLinear, disconnectLinear, isLinearConnected } from '../mcp/linearAuth'
import { isGoogleTasksConnected } from '../mcp/googleTasksClient'
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  isGoogleCalendarConnected
} from '../mcp/googleCalendarAuth'

export function registerAuthIpc(): void {
  ipcMain.handle('auth:linear:connect', async () => {
    await connectLinear()
  })
  ipcMain.handle('auth:linear:status', async () => isLinearConnected())
  ipcMain.handle('auth:linear:disconnect', async () => {
    await disconnectLinear()
  })

  ipcMain.handle('auth:googleTasks:status', async () => isGoogleTasksConnected())

  ipcMain.handle('auth:googleCalendar:connect', async () => {
    await connectGoogleCalendar()
  })
  ipcMain.handle('auth:googleCalendar:status', async () => isGoogleCalendarConnected())
  ipcMain.handle('auth:googleCalendar:disconnect', async () => {
    await disconnectGoogleCalendar()
  })
}
