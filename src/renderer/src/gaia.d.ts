export {}

declare global {
  interface Window {
    gaia: {
      chat: {
        send: (text: string) => Promise<{ text: string; model: string; taskActions: string[] }>
      }
      auth: {
        linear: {
          connect: () => Promise<void>
          status: () => Promise<boolean>
        }
      }
      hud: {
        badge: () => Promise<string | null>
      }
    }
  }
}
