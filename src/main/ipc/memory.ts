import { ipcMain } from 'electron'
import { getCoreFacts, hasCoreFacts, upsertCoreFact, deleteFact } from '../supabase/memory'
import { parseFreeTextToCoreFacts } from '../claude/coreFactsParser'

export function registerMemoryIpc(): void {
  ipcMain.handle('memory:hasCoreFacts', async () => hasCoreFacts())
  ipcMain.handle('memory:getCoreFacts', async () => getCoreFacts())
  ipcMain.handle(
    'memory:upsertCoreFact',
    async (_event, fact: { id?: number; category: string | null; content: string }) => {
      await upsertCoreFact(fact)
    }
  )
  ipcMain.handle('memory:deleteFact', async (_event, id: number) => {
    await deleteFact(id)
  })
  ipcMain.handle('memory:parseFreeText', async (_event, text: string) => {
    await parseFreeTextToCoreFacts(text)
  })
}
