import { execSync } from 'node:child_process'
import { config } from 'dotenv'
config()

/** Electron hérite souvent d'un PATH figé au lancement — recharger Machine+User pour ffmpeg/python winget. */
if (process.platform === 'win32') {
  try {
    const path = execSync(
      'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
      { encoding: 'utf8' }
    ).trim()
    process.env.Path = path
    process.env.PATH = path
  } catch {
    // winget/ffmpeg absents : on garde le PATH hérité
  }
}

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { registerChatIpc } from './ipc/chat'
import { registerAuthIpc } from './ipc/auth'
import { registerHudIpc } from './ipc/hud'
import { registerMemoryIpc } from './ipc/memory'
import { registerSettingsIpc } from './ipc/settings'
import { registerVoiceIpc } from './ipc/voice'
import { registerHudStateWindow } from './hud/hudState'
import { startPushToTalkListener } from './voice/ptt'
import { initOllama } from './ollama/client'

// TTS Piper arrive après l'appel API (plusieurs secondes après le clic micro) — sans ça,
// Chromium bloque audio.play() faute de geste utilisateur récent.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

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
  void startPushToTalkListener(mainWindow)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Un lien markdown dans une réponse (spec 8.9) navigue la fenêtre par défaut sans ce garde —
  // on la fait rester sur l'appli et on ouvre le lien dans le navigateur système à la place.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(mainWindow.webContents.getURL()).origin) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerChatIpc()
  registerAuthIpc()
  registerHudIpc()
  registerMemoryIpc()
  registerSettingsIpc()
  registerVoiceIpc()
  createWindow()

  const ollamaOk = await initOllama()
  if (!ollamaOk) {
    BrowserWindow.getAllWindows()[0]?.webContents.send('ollama:unavailable')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
