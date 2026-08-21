import { getSupabaseClient, isSupabaseConfigured } from './client'

interface AppSettingsRow {
  rss_feeds: string[] | null
  weather_city_override: string | null
}

async function getRow(): Promise<AppSettingsRow | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('rss_feeds, weather_city_override')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function getRssFeedOverride(): Promise<string[] | null> {
  const row = await getRow()
  return row?.rss_feeds && row.rss_feeds.length > 0 ? row.rss_feeds : null
}

export async function getWeatherCityOverride(): Promise<string | null> {
  const row = await getRow()
  return row?.weather_city_override ?? null
}

export async function setRssFeeds(feeds: string[]): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 'default', rss_feeds: feeds, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function setWeatherCityOverride(city: string | null): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 'default', weather_city_override: city, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
