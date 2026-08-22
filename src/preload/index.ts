import { contextBridge, ipcRenderer } from 'electron'

type Attachment =
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  | { kind: 'pdf'; data: string }

contextBridge.exposeInMainWorld('gaia', {
  chat: {
    send: (
      text: string,
      attachments?: Attachment[],
      isVoice?: boolean
    ): Promise<{ text: string; model: string; taskActions: string[]; imageDataUri: string | null }> =>
      ipcRenderer.invoke('chat:send', text, attachments, isVoice),
    onTextChunk: (callback: (delta: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, delta: string): void => callback(delta)
      ipcRenderer.on('chat:textChunk', listener)
      return () => ipcRenderer.removeListener('chat:textChunk', listener)
    },
    onTtsAudio: (callback: (wav: ArrayBuffer) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, wav: ArrayBuffer): void => callback(wav)
      ipcRenderer.on('chat:ttsAudio', listener)
      return () => ipcRenderer.removeListener('chat:ttsAudio', listener)
    }
  },
  auth: {
    linear: {
      connect: (): Promise<void> => ipcRenderer.invoke('auth:linear:connect'),
      status: (): Promise<boolean> => ipcRenderer.invoke('auth:linear:status'),
      disconnect: (): Promise<void> => ipcRenderer.invoke('auth:linear:disconnect')
    },
    googleTasks: {
      status: (): Promise<boolean> => ipcRenderer.invoke('auth:googleTasks:status')
    },
    googleCalendar: {
      connect: (): Promise<void> => ipcRenderer.invoke('auth:googleCalendar:connect'),
      status: (): Promise<boolean> => ipcRenderer.invoke('auth:googleCalendar:status'),
      disconnect: (): Promise<void> => ipcRenderer.invoke('auth:googleCalendar:disconnect')
    }
  },
  hud: {
    badge: (): Promise<string | null> => ipcRenderer.invoke('hud:badge'),
    onState: (callback: (payload: { state: string; detail?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { state: string; detail?: string }): void =>
        callback(payload)
      ipcRenderer.on('hud:state', listener)
      return () => ipcRenderer.removeListener('hud:state', listener)
    }
  },
  memory: {
    hasCoreFacts: (): Promise<boolean> => ipcRenderer.invoke('memory:hasCoreFacts'),
    getCoreFacts: (): Promise<{ id: number; category: string | null; content: string }[]> =>
      ipcRenderer.invoke('memory:getCoreFacts'),
    upsertCoreFact: (fact: { id?: number; category: string | null; content: string }): Promise<void> =>
      ipcRenderer.invoke('memory:upsertCoreFact', fact),
    deleteFact: (id: number): Promise<void> => ipcRenderer.invoke('memory:deleteFact', id),
    parseFreeText: (text: string): Promise<void> => ipcRenderer.invoke('memory:parseFreeText', text)
  },
  settings: {
    getRssFeeds: (): Promise<string[] | null> => ipcRenderer.invoke('settings:getRssFeeds'),
    setRssFeeds: (feeds: string[]): Promise<void> => ipcRenderer.invoke('settings:setRssFeeds', feeds),
    getWeatherCity: (): Promise<string | null> => ipcRenderer.invoke('settings:getWeatherCity'),
    setWeatherCity: (city: string | null): Promise<void> => ipcRenderer.invoke('settings:setWeatherCity', city),
    getAppVersion: (): Promise<string> => ipcRenderer.invoke('settings:getAppVersion'),
    getTodayCostUsd: (): Promise<number | null> => ipcRenderer.invoke('settings:getTodayCostUsd'),
    getPttShortcut: (): Promise<string | null> => ipcRenderer.invoke('settings:getPttShortcut'),
    setPttShortcut: (key: string): Promise<void> => ipcRenderer.invoke('settings:setPttShortcut', key),
    getPiperVoice: (): Promise<string | null> => ipcRenderer.invoke('settings:getPiperVoice'),
    setPiperVoice: (name: string): Promise<void> => ipcRenderer.invoke('settings:setPiperVoice', name)
  },
  voice: {
    transcribe: (audio: ArrayBuffer): Promise<string> => ipcRenderer.invoke('voice:transcribe', audio),
    onPttStart: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('ptt:start', listener)
      return () => ipcRenderer.removeListener('ptt:start', listener)
    },
    onPttStop: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('ptt:stop', listener)
      return () => ipcRenderer.removeListener('ptt:stop', listener)
    }
  }
})
