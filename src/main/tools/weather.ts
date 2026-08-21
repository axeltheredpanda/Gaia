// Codes WMO (https://open-meteo.com/en/docs) réduits aux libellés utiles pour un badge court.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'ciel dégagé',
  1: 'plutôt dégagé',
  2: 'partiellement nuageux',
  3: 'couvert',
  45: 'brouillard',
  48: 'brouillard givrant',
  51: 'bruine légère',
  53: 'bruine',
  55: 'bruine forte',
  61: 'pluie légère',
  63: 'pluie',
  65: 'pluie forte',
  71: 'neige légère',
  73: 'neige',
  75: 'neige forte',
  80: 'averses',
  81: 'averses fortes',
  82: 'averses violentes',
  95: 'orage',
  96: 'orage avec grêle'
}

function labelForCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? 'conditions variables'
}

interface Coordinates {
  latitude: number
  longitude: number
  resolvedName: string
}

async function geocodeCity(city: string): Promise<Coordinates | null> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', city)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'fr')

  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { results?: { latitude: number; longitude: number; name: string }[] }
  const result = data.results?.[0]
  if (!result) return null
  return { latitude: result.latitude, longitude: result.longitude, resolvedName: result.name }
}

/** Open-Meteo : gratuit, sans clé (spec 8.1). */
export async function getWeather(city: string): Promise<string> {
  const coords = await geocodeCity(city).catch(() => null)
  if (!coords) return `Ville "${city}" introuvable pour la météo.`

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(coords.latitude))
  url.searchParams.set('longitude', String(coords.longitude))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('timezone', 'auto')

  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return `Météo indisponible pour ${coords.resolvedName}.`
  const data = (await res.json()) as {
    current?: { temperature_2m: number; weather_code: number }
    daily?: { temperature_2m_max: number[]; temperature_2m_min: number[] }
  }
  if (!data.current) return `Météo indisponible pour ${coords.resolvedName}.`

  const label = labelForCode(data.current.weather_code)
  const max = data.daily?.temperature_2m_max?.[0]
  const min = data.daily?.temperature_2m_min?.[0]
  const range = max !== undefined && min !== undefined ? ` (${Math.round(min)}°C / ${Math.round(max)}°C)` : ''
  return `${coords.resolvedName} : ${Math.round(data.current.temperature_2m)}°C actuellement, ${label}${range}.`
}
