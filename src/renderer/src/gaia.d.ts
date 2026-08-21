export {}

export type Attachment =
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string }
  | { kind: 'pdf'; data: string }

declare global {
  interface Window {
    gaia: {
      chat: {
        send: (
          text: string,
          attachments?: Attachment[]
        ) => Promise<{ text: string; model: string; taskActions: string[]; imageDataUri: string | null }>
      }
      auth: {
        linear: {
          connect: () => Promise<void>
          status: () => Promise<boolean>
          disconnect: () => Promise<void>
        }
        googleTasks: {
          status: () => Promise<boolean>
        }
        googleCalendar: {
          connect: () => Promise<void>
          status: () => Promise<boolean>
          disconnect: () => Promise<void>
        }
      }
      hud: {
        badge: () => Promise<string | null>
        onState: (callback: (payload: { state: string; detail?: string }) => void) => () => void
      }
      memory: {
        hasCoreFacts: () => Promise<boolean>
        getCoreFacts: () => Promise<{ id: number; category: string | null; content: string }[]>
        upsertCoreFact: (fact: { id?: number; category: string | null; content: string }) => Promise<void>
        deleteFact: (id: number) => Promise<void>
        parseFreeText: (text: string) => Promise<void>
      }
    }
  }
}
