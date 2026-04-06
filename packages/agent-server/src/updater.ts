/**
 * Update proxy — delegates to the sidecar HTTP endpoints.
 *
 * The sidecar (a stable Go binary) handles the actual update lifecycle:
 * stop agent → git pull → pnpm install → build → start agent → verify health.
 *
 * This module:
 *   1. Periodically checks for updates via the sidecar
 *   2. Proxies update_start requests to the sidecar's streaming endpoint
 *   3. Relays progress back to the desktop/CLI via WebSocket
 */

import { UPDATE_CHECK_INTERVAL, type UpdateManifest, VERSION } from '@anton/agent-config'
import { createLogger } from '@anton/logger'

export type UpdateStage =
  | 'checking'
  | 'stopping'
  | 'downloading'
  | 'installing'
  | 'building'
  | 'starting'
  | 'verifying'
  | 'done'
  | 'error'
export type UpdateProgress = { stage: UpdateStage; message: string }

const log = createLogger('updater')

/** Default sidecar port */
const SIDECAR_PORT = Number(process.env.SIDECAR_PORT) || 9878
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`

interface SidecarCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion?: string
  changelog?: string
  releaseUrl?: string
}

export class Updater {
  private cachedCheck: SidecarCheckResult | null = null
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private updating = false
  private token: string

  /** Called when a periodic check discovers a new version */
  onUpdateFound?: (manifest: UpdateManifest) => void

  constructor(token?: string) {
    this.token = token ?? process.env.ANTON_TOKEN ?? ''
  }

  /** Start periodic update checks */
  start() {
    this.checkForUpdates().catch((err) => {
      log.warn({ err }, 'update check failed')
    })

    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch((err) => {
        log.warn({ err }, 'update check failed')
      })
    }, UPDATE_CHECK_INTERVAL)
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
  }

  /** Get cached update info (for auth_ok handshake) */
  getUpdateAvailable(): UpdateManifest | null {
    if (!this.cachedCheck?.updateAvailable || !this.cachedCheck.latestVersion) return null
    return {
      version: this.cachedCheck.latestVersion,
      changelog: this.cachedCheck.changelog ?? '',
      releaseUrl: this.cachedCheck.releaseUrl ?? '',
      gitHash: '',
    }
  }

  /** Check for updates via the sidecar */
  async checkForUpdates(): Promise<{
    updateAvailable: boolean
    manifest: UpdateManifest | null
  }> {
    try {
      const res = await fetch(`${SIDECAR_BASE}/update/check`, {
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${this.token}` },
      })

      if (!res.ok) {
        log.warn({ status: res.status }, 'sidecar update check failed')
        return { updateAvailable: false, manifest: null }
      }

      const result = (await res.json()) as SidecarCheckResult
      this.cachedCheck = result

      if (result.updateAvailable && result.latestVersion) {
        log.info(
          { current: result.currentVersion, available: result.latestVersion },
          'update available',
        )

        const manifest: UpdateManifest = {
          version: result.latestVersion,
          changelog: result.changelog ?? '',
          releaseUrl: result.releaseUrl ?? '',
          gitHash: '',
        }

        if (this.onUpdateFound) {
          this.onUpdateFound(manifest)
        }

        return { updateAvailable: true, manifest }
      }

      return { updateAvailable: false, manifest: null }
    } catch (err) {
      log.warn({ err }, 'sidecar update check error')
      return { updateAvailable: false, manifest: null }
    }
  }

  /**
   * Execute update via the sidecar's streaming endpoint.
   * Yields progress events as they arrive from the sidecar.
   */
  async *selfUpdate(): AsyncGenerator<UpdateProgress> {
    if (this.updating) {
      yield { stage: 'error', message: 'Update already in progress' }
      return
    }

    this.updating = true

    try {
      const res = await fetch(`${SIDECAR_BASE}/update/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(600_000), // 10 min max
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        yield { stage: 'error', message: `Sidecar error: ${res.status} ${body}` }
        return
      }

      if (!res.body) {
        yield { stage: 'error', message: 'No response body from sidecar' }
        return
      }

      // Stream newline-delimited JSON from the sidecar
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const progress = JSON.parse(trimmed) as UpdateProgress
            log.info({ stage: progress.stage }, progress.message)
            yield progress
          } catch {
            log.warn({ line: trimmed }, 'failed to parse sidecar progress')
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const progress = JSON.parse(buffer.trim()) as UpdateProgress
          yield progress
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      yield { stage: 'error', message: `Update failed: ${(err as Error).message}` }
    } finally {
      this.updating = false
      this.cachedCheck = null
    }
  }

  /** Get current update status */
  getStatus() {
    const check = this.cachedCheck
    return {
      currentVersion: VERSION,
      latestVersion: check?.latestVersion ?? null,
      updateAvailable: check?.updateAvailable ?? false,
      changelog: check?.changelog ?? null,
      releaseUrl: check?.releaseUrl ?? null,
    }
  }
}
