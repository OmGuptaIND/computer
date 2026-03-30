/**
 * HTTP handler for POST /_anton/oauth/callback
 *
 * Receives tokens from the OAuth proxy after successful authorization.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OAuthFlow } from './oauth-flow.js'

export function oauthCallbackHandler(
  req: IncomingMessage,
  res: ServerResponse,
  oauthFlow: OAuthFlow,
  onComplete: (result: { provider: string; success: boolean; error?: string }) => void,
): void {
  let body = ''

  req.on('data', (chunk: Buffer) => {
    body += chunk.toString()
    // Limit body size to 64KB
    if (body.length > 65536) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Request too large' }))
      req.destroy()
    }
  })

  req.on('end', () => {
    try {
      const data = JSON.parse(body)

      if (!data.provider || !data.nonce || !data.access_token) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing required fields: provider, nonce, access_token' }))
        return
      }

      const result = oauthFlow.handleCallback(data)

      if (result.success) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: result.error }))
      }

      // Notify the server to update connector status and tell the desktop
      onComplete(result)
    } catch (_err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    }
  })
}
