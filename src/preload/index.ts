import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('gaia', {
  chat: {
    send: (text: string): Promise<string> => ipcRenderer.invoke('chat:send', text)
  }
})
