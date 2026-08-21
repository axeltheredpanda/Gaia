export {}

declare global {
  interface Window {
    gaia: {
      chat: {
        send: (
          text: string
        ) => Promise<{ text: string; model: string; taskActions: string[]; imageDataUri: string | null }>
      }
      auth: {
        linear: {
          connect: () => Promise<void>
          status: () => Promise<boolean>
        }
        googleTasks: {
          status: () => Promise<boolean>
        }
      }
      hud: {
        badge: () => Promise<string | null>
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
