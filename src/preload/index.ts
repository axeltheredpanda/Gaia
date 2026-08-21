import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('gaia', {
  chat: {
    send: (text: string): Promise<{ text: string; model: string; taskActions: string[] }> =>
      ipcRenderer.invoke('chat:send', text)
  },
  auth: {
    linear: {
      connect: (): Promise<void> => ipcRenderer.invoke('auth:linear:connect'),
      status: (): Promise<boolean> => ipcRenderer.invoke('auth:linear:status')
    }
  },
  hud: {
    badge: (): Promise<string | null> => ipcRenderer.invoke('hud:badge')
  },
  memory: {
    hasCoreFacts: (): Promise<boolean> => ipcRenderer.invoke('memory:hasCoreFacts'),
    getCoreFacts: (): Promise<{ id: number; category: string | null; content: string }[]> =>
      ipcRenderer.invoke('memory:getCoreFacts'),
    upsertCoreFact: (fact: { id?: number; category: string | null; content: string }): Promise<void> =>
      ipcRenderer.invoke('memory:upsertCoreFact', fact),
    deleteFact: (id: number): Promise<void> => ipcRenderer.invoke('memory:deleteFact', id),
    parseFreeText: (text: string): Promise<void> => ipcRenderer.invoke('memory:parseFreeText', text)
  }
})
