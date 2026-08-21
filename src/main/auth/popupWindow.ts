import { BrowserWindow } from 'electron'

export function openAuthPopup(url: string): BrowserWindow {
  const popup = new BrowserWindow({
    width: 480,
    height: 720,
    webPreferences: { sandbox: true }
  })
  popup.loadURL(url)
  return popup
}
