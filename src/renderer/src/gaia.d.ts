export {}

declare global {
  interface Window {
    gaia: {
      chat: {
        send: (text: string) => Promise<string>
      }
    }
  }
}
