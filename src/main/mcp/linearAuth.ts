import { generateCodeChallenge, generateRandomToken } from '../auth/pkce'
import { openAuthPopup } from '../auth/popupWindow'
import { waitForOAuthCallback } from '../auth/localCallbackServer'
import { getSecret, setSecret } from '../supabase/vault'

export const LINEAR_MCP_URL = 'https://mcp.linear.app/mcp'

const REDIRECT_PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
const VAULT_SECRET_NAME = 'linear_access_token'

let cachedAccessToken: string | null = null

interface AuthServerMetadata {
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint?: string
}

async function discoverAuthServer(): Promise<AuthServerMetadata> {
  const origin = new URL(LINEAR_MCP_URL).origin
  let authServerBase = origin

  const resourceRes = await fetch(`${origin}/.well-known/oauth-protected-resource`)
  if (resourceRes.ok) {
    const resource = (await resourceRes.json()) as { authorization_servers?: string[] }
    authServerBase = resource.authorization_servers?.[0] ?? origin
  }

  const metadataRes = await fetch(`${authServerBase}/.well-known/oauth-authorization-server`)
  if (!metadataRes.ok) {
    throw new Error(`Découverte OAuth Linear échouée (${metadataRes.status})`)
  }
  return metadataRes.json() as Promise<AuthServerMetadata>
}

async function registerClient(registrationEndpoint: string): Promise<{ client_id: string }> {
  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Gaia',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    })
  })
  if (!res.ok) {
    throw new Error(`Enregistrement du client OAuth Linear échoué (${res.status})`)
  }
  return res.json() as Promise<{ client_id: string }>
}

/** Flow OAuth 2.1 + PKCE + enregistrement dynamique de client (RFC 7591), popup + redirect local (spec 4.7). */
export async function connectLinear(): Promise<void> {
  const metadata = await discoverAuthServer()
  if (!metadata.registration_endpoint) {
    throw new Error("Le serveur MCP Linear ne propose pas d'enregistrement dynamique de client")
  }
  const { client_id: clientId } = await registerClient(metadata.registration_endpoint)

  const codeVerifier = generateRandomToken()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateRandomToken()

  const authorizeUrl = new URL(metadata.authorization_endpoint)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('state', state)

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
    throw new Error(params.get('error_description') ?? 'Autorisation Linear refusée')
  }

  const tokenRes = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier
    })
  })
  if (!tokenRes.ok) {
    throw new Error(`Échange du token Linear échoué (${tokenRes.status})`)
  }
  const tokens = (await tokenRes.json()) as { access_token: string }
  cachedAccessToken = tokens.access_token

  try {
    await setSecret(VAULT_SECRET_NAME, tokens.access_token)
  } catch (error) {
    // le token reste utilisable pour cette session ; seule la persistance entre
    // relances de l'app est perdue si Supabase Vault est indisponible
    console.error('Stockage du token Linear dans Supabase Vault échoué', error)
  }
}

/**
 * LINEAR_API_KEY (clé personnelle Linear) sert de raccourci pour tester
 * l'intégration sans passer par le flow OAuth popup — le serveur MCP Linear
 * accepte les deux comme Bearer token.
 */
export async function getLinearAuthorizationToken(): Promise<string | null> {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY
  if (cachedAccessToken) return cachedAccessToken
  try {
    const stored = await getSecret(VAULT_SECRET_NAME)
    if (stored) cachedAccessToken = stored
    return stored || null
  } catch (error) {
    console.error('Lecture du token Linear depuis Supabase Vault échouée', error)
    return null
  }
}

export async function isLinearConnected(): Promise<boolean> {
  return (await getLinearAuthorizationToken()) !== null
}

/** Ne s'applique qu'au token obtenu via le flow OAuth popup — LINEAR_API_KEY reste actif si défini. */
export async function disconnectLinear(): Promise<void> {
  cachedAccessToken = null
  await setSecret(VAULT_SECRET_NAME, '').catch((error) =>
    console.error('Effacement du token Linear dans Supabase Vault échoué', error)
  )
}
