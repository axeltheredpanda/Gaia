import { ipcMain } from 'electron'
import { sendChat } from '../claude/chat'
import type { Attachment } from '../claude/attachments'

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (_event, userText: string, attachments?: Attachment[]) =>
    sendChat(userText, attachments)
  )
}
