import { ipcMain } from 'electron'
import { sendChat } from '../claude/chat'

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (_event, userText: string) => sendChat(userText))
}
