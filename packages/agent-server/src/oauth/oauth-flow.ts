/**
 * OAuth flow manager for the agent server.
 *
 * Handles:
 * 1. Starting OAuth flows (generate auth URL for desktop to open)
 * 2. Receiving tokens from the OAuth proxy callback
 * 3. Token refresh via the proxy
 */

import { randomBytes } from 'node:crypto'
import type { AgentConfig } from '@anton/agent-config'
import { TokenStore, type StoredToken } from './token-store.js'

interface PendingFlow {
  nonce: string
  provider: string
  createdAt: number
}

export class OAuthFlow {
  private pending = new Map<string, PendingFlow>()
  private tokenStore: TokenStore
  private config: AgentConfig

  constructor(config: AgentConfig, tokenStore: TokenStore) {
    this.config = config
    this.tokenStore = tokenStore
  }

  /**
   * Start an OAuth flow. Returns the URL to open in the browser.
   * Returns null if the proxy URL is not configured.
   */
  startFlow(provider: string, scopes?: string[]): string | null {
    const proxyUrl = this.getProxyUrl()
    if (!proxyUrl) return null

    const callbackBaseUrl = this.getCallbackBaseUrl()
    if (!callbackBaseUrl) return null

    const nonce = randomBytes(32).toString('hex')
    this.pending.set(nonce, { nonce, provider, createdAt: Date.now() })

    // Auto-expire after 10 minutes
    setTimeout(() => this.pending.delete(nonce), 10 * 60 * 1000)

    const callbackUrl = `${callbackBaseUrl}/_anton/oauth/callback`
    const params = new URLSearchParams({
      callback_url: callbackUrl,
      nonce,
    })

    // Pass connector-specific scopes so the proxy doesn't use its own defaults
    if (scopes && scopes.length > 0) {
      params.set('scope', scopes.join(' '))
    }

    return `${proxyUrl}/oauth/${provider}/authorize?${params.toString()}`
  }

  /**
   * Handle the callback from the OAuth proxy.
   * Validates the nonce, stores the token, returns result.
   */
  handleCallback(body: {
    provider: string
    nonce: string
    access_token: string
    refresh_token?: string
    expires_in?: number
    metadata?: Record<string, string>
  }): { provider: string; success: boolean; error?: string } {
    const pending = this.pending.get(body.nonce)

    if (!pending) {
      return { provider: body.provider, success: false, error: 'Invalid or expired nonce' }
    }

    if (pending.provider !== body.provider) {
      return { provider: body.provider, success: false, error: 'Provider mismatch' }
    }

    // Single-use nonce
    this.pending.delete(body.nonce)

    const token: StoredToken = {
      provider: body.provider,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: body.expires_in
        ? Math.floor(Date.now() / 1000) + body.expires_in
        : undefined,
      metadata: body.metadata,
    }

    this.tokenStore.save(body.provider, token)
    return { provider: body.provider, success: true }
  }

  /**
   * Get a valid access token, refreshing if needed.
   * Throws if no token exists or refresh fails.
   */
  async getToken(provider: string): Promise<string> {
    const stored = this.tokenStore.load(provider)
    if (!stored) {
      throw new Error(`No OAuth token stored for ${provider}`)
    }

    // If token has an expiry and is within 5 minutes of expiring, refresh
    if (stored.expiresAt && stored.expiresAt < Date.now() / 1000 + 300) {
      if (!stored.refreshToken) {
        throw new Error(`Token expired and no refresh token available for ${provider}`)
      }

      const proxyUrl = this.getProxyUrl()
      if (!proxyUrl) {
        throw new Error('Cannot refresh token: oauth proxy URL not configured')
      }

      const res = await fetch(`${proxyUrl}/oauth/${provider}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Token refresh failed for ${provider}: ${errText}`)
      }

      const data = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
      }

      stored.accessToken = data.access_token
      if (data.refresh_token) stored.refreshToken = data.refresh_token
      if (data.expires_in) stored.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in
      this.tokenStore.save(provider, stored)
    }

    return stored.accessToken
  }

  /** Check if a provider has a stored token */
  hasToken(provider: string): boolean {
    return this.tokenStore.load(provider) !== null
  }

  /** Remove a provider's stored token */
  disconnect(provider: string): void {
    this.tokenStore.delete(provider)
  }

  /** List all providers with stored tokens */
  listConnected(): string[] {
    return this.tokenStore.list()
  }

  private getProxyUrl(): string | null {
    return (
      process.env.OAUTH_PROXY_URL ||
      this.config.oauth?.proxyUrl ||
      null
    )
  }

  private getCallbackBaseUrl(): string | null {
    return (
      process.env.OAUTH_CALLBACK_BASE_URL ||
      this.config.oauth?.callbackBaseUrl ||
      null
    )
  }
}
