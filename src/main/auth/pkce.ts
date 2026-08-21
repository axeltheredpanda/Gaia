import { randomBytes, createHash } from 'node:crypto'

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateRandomToken(): string {
  return base64url(randomBytes(32))
}

export function generateCodeChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}
