import { config } from 'dotenv'
config()

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { registerChatIpc } from './ipc/chat'
import { registerAuthIpc } from './ipc/auth'
import { registerHudIpc } from './ipc/hud'
import { registerMemoryIpc } from './ipc/memory'
import { startHudBadgeRefreshLoop } from './claude/hudBadge'
import { registerHudStateWindow } from './hud/hudState'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#070b09',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  registerHudStateWindow(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerChatIpc()
  registerAuthIpc()
  registerHudIpc()
  registerMemoryIpc()
  startHudBadgeRefreshLoop()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
