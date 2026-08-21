import { generateCodeChallenge, generateRandomToken } from '../auth/pkce'
import { openAuthPopup } from '../auth/popupWindow'
import { waitForOAuthCallback } from '../auth/localCallbackServer'
import { getSecret, setSecret } from '../supabase/vault'

export const GOOGLE_CALENDAR_MCP_URL = 'https://calendarmcp.googleapis.com/mcp/v1'

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
// Lecture seule : la spec ne demande que de croiser/lire (8.3), pas d'écrire dans Calendar.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
].join(' ')

const REDIRECT_PORT = 53683
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const VAULT_SECRET_NAME = 'google_calendar_tokens'

interface TokenBundle {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

let cached: TokenBundle | null = null

/**
 * Contrairement à Linear, les serveurs MCP Google ne supportent pas l'enregistrement
 * dynamique de client (DCR) — vérifié avant d'écrire ce code, pas supposé. Il faut un
 * client OAuth Google Cloud pré-enregistré (type "Desktop app", comme pour Google Tasks),
 * flow d'autorisation classique + PKCE, popup + redirect local (spec 4.7).
 */
export async function connectGoogleCalendar(): Promise<void> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET manquantes (voir .env.example)')
  }

  const codeVerifier = generateRandomToken()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateRandomToken()

  const authorizeUrl = new URL(AUTHORIZATION_ENDPOINT)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authorizeUrl.searchParams.set('scope', SCOPES)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('access_type', 'offline')
  authorizeUrl.searchParams.set('prompt', 'consent') // pour obtenir un refresh_token à chaque connexion

  const { result, close } = waitForOAuthCallback(REDIRECT_PORT)
  const popup = openAuthPopup(authorizeUrl.toString())

  let params: URLSearchParams
  try {
    params = await result
  } finally {
    if (!popup.isDestroyed()) popup.close()
    close()
  }

  if (params.get('state') !== state) {
    throw new Error('État OAuth invalide (state mismatch)')
  }
  const code = params.get('code')
  if (!code) {
    throw new Error(params.get('error_description') ?? 'Autorisation Google Calendar refusée')
  }

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier
    })
  })
  if (!tokenRes.ok) {
    throw new Error(`Échange du token Google Calendar échoué (${tokenRes.status})`)
  }
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number }

  cached = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000
  }

  try {
    await setSecret(VAULT_SECRET_NAME, JSON.stringify(cached))
  } catch (error) {
    console.error('Stockage du token Google Calendar dans Supabase Vault échoué', error)
  }
}

async function refreshAccessToken(bundle: TokenBundle): Promise<TokenBundle | null> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  if (!bundle.refreshToken || !clientId || !clientSecret) return null

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: bundle.refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return { accessToken: data.access_token, refreshToken: bundle.refreshToken, expiresAt: Date.now() + data.expires_in * 1000 }
}

async function loadTokenBundle(): Promise<TokenBundle | null> {
  if (cached) return cached
  try {
    const stored = await getSecret(VAULT_SECRET_NAME)
    if (!stored) return null
    cached = JSON.parse(stored) as TokenBundle
    return cached
  } catch (error) {
    console.error('Lecture du token Google Calendar depuis Supabase Vault échouée', error)
    return null
  }
}

export async function getGoogleCalendarAuthorizationToken(): Promise<string | null> {
  const bundle = await loadTokenBundle()
  if (!bundle) return null

  const isExpiringSoon = bundle.expiresAt < Date.now() + 60_000
  if (!isExpiringSoon) return bundle.accessToken

  const refreshed = await refreshAccessToken(bundle)
  if (!refreshed) return null
  cached = refreshed
  await setSecret(VAULT_SECRET_NAME, JSON.stringify(refreshed)).catch((error) =>
    console.error('Mise à jour du token Google Calendar dans Supabase Vault échouée', error)
  )
  return refreshed.accessToken
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  return (await getGoogleCalendarAuthorizationToken()) !== null
}

export async function disconnectGoogleCalendar(): Promise<void> {
  cached = null
  await setSecret(VAULT_SECRET_NAME, '').catch((error) =>
    console.error('Effacement du token Google Calendar dans Supabase Vault échoué', error)
  )
}
