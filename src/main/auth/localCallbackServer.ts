import { createServer, type Server } from 'node:http'

export function waitForOAuthCallback(port: number): {
  result: Promise<URLSearchParams>
  close: () => void
} {
  let server: Server

  const result = new Promise<URLSearchParams>((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<html><body>Gaia est connectée. Vous pouvez fermer cette fenêtre.</body></html>')
      resolve(url.searchParams)
      server.close()
    })
    server.on('error', reject)
    server.listen(port, '127.0.0.1')
  })

  return { result, close: () => server?.close() }
}
