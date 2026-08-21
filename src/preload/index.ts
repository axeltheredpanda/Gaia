import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('gaia', {
  chat: {
    send: (text: string): Promise<string> => ipcRenderer.invoke('chat:send', text)
  },
  auth: {
    linear: {
      connect: (): Promise<void> => ipcRenderer.invoke('auth:linear:connect'),
      status: (): Promise<boolean> => ipcRenderer.invoke('auth:linear:status')
    }
  }
})
