import { ipcMain, app } from 'electron'
import {
  getRssFeedOverride,
  getWeatherCityOverride,
  setRssFeeds,
  setWeatherCityOverride
} from '../supabase/settings'
import { getTodayCostUsd } from '../supabase/apiUsage'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:getRssFeeds', async () => getRssFeedOverride())
  ipcMain.handle('settings:setRssFeeds', async (_event, feeds: string[]) => {
    await setRssFeeds(feeds)
  })
  ipcMain.handle('settings:getWeatherCity', async () => getWeatherCityOverride())
  ipcMain.handle('settings:setWeatherCity', async (_event, city: string | null) => {
    await setWeatherCityOverride(city)
  })
  ipcMain.handle('settings:getAppVersion', () => app.getVersion())
  ipcMain.handle('settings:getTodayCostUsd', async () => getTodayCostUsd())
}
