import { ipcMain } from 'electron'
import { transcribeAudio } from '../voice/asr'

export function registerVoiceIpc(): void {
  ipcMain.handle('voice:transcribe', async (_event, audio: ArrayBuffer) => transcribeAudio(Buffer.from(audio)))
}
