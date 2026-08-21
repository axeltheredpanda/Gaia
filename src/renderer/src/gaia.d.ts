export {}

declare global {
  interface Window {
    gaia: {
      chat: {
        send: (text: string) => Promise<string>
      }
      auth: {
        linear: {
          connect: () => Promise<void>
          status: () => Promise<boolean>
        }
      }
    }
  }
}
