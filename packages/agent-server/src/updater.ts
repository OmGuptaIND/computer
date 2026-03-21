/**
 * Self-update checker and executor for the anton.computer agent.
 *
 * Flow:
 *   1. On startup + every UPDATE_CHECK_INTERVAL, fetch the manifest from GitHub
 *   2. Compare versions — if newer, cache the manifest
 *   3. On client connect (auth_ok), include updateAvailable if cached
 *   4. Client can trigger update_start → agent pulls, rebuilds, restarts via systemd
 *
 * The agent owns its own updates. The desktop is just a viewer.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SPEC_VERSION,
  UPDATE_CHECK_INTERVAL,
  UPDATE_MANIFEST_URL,
  type UpdateManifest,
  VERSION,
  getAntonDir,
  semverGt,
} from '@anton/agent-config'

const CACHED_MANIFEST_PATH = join(getAntonDir(), 'update-manifest.json')

export class Updater {
  private cachedManifest: UpdateManifest | null = null
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private updating = false

  /** Start periodic update checks */
  start() {
    // Load cached manifest from disk (persists across restarts)
    this.loadCachedManifest()

    // Check immediately on startup, then periodically
    this.checkForUpdates().catch((err) => {
      console.warn('  Update check failed:', (err as Error).message)
    })

    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch((err) => {
        console.warn('  Update check failed:', (err as Error).message)
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
    if (!this.cachedManifest) return null
    // Only return if it's actually newer than current
    if (semverGt(this.cachedManifest.version, VERSION)) {
      return this.cachedManifest
    }
    return null
  }

  /** Check the manifest URL for a newer version */
  async checkForUpdates(): Promise<{
    updateAvailable: boolean
    manifest: UpdateManifest | null
  }> {
    try {
      const res = await fetch(UPDATE_MANIFEST_URL, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': `anton-agent/${VERSION}` },
      })

      if (!res.ok) {
        return { updateAvailable: false, manifest: null }
      }

      const manifest = (await res.json()) as UpdateManifest

      if (semverGt(manifest.version, VERSION)) {
        this.cachedManifest = manifest
        this.saveCachedManifest()
        console.log(`  Update available: v${VERSION} → v${manifest.version}`)
        return { updateAvailable: true, manifest }
      }

      // Current version is up to date — clear any stale cache
      if (this.cachedManifest) {
        this.cachedManifest = null
        this.saveCachedManifest()
      }

      return { updateAvailable: false, manifest }
    } catch {
      // Network error, offline, etc. — not a problem
      return { updateAvailable: false, manifest: this.cachedManifest }
    }
  }

  /** Execute self-update: git pull → pnpm install → pnpm build → restart */
  async *selfUpdate(): AsyncGenerator<{
    stage: 'pulling' | 'installing' | 'building' | 'restarting' | 'done' | 'error'
    message: string
  }> {
    if (this.updating) {
      yield { stage: 'error', message: 'Update already in progress' }
      return
    }

    this.updating = true
    const agentDir = this.resolveAgentDir()

    if (!agentDir) {
      yield { stage: 'error', message: 'Could not find agent source directory' }
      this.updating = false
      return
    }

    try {
      // 1. Pull latest code
      yield { stage: 'pulling', message: 'Pulling latest code from remote...' }
      const pullOutput = this.run('git pull --ff-only', agentDir)
      yield { stage: 'pulling', message: pullOutput }

      // 2. Install dependencies
      yield { stage: 'installing', message: 'Installing dependencies...' }
      const installOutput = this.run('pnpm install --no-frozen-lockfile', agentDir)
      yield { stage: 'installing', message: installOutput }

      // 3. Build
      yield { stage: 'building', message: 'Building packages...' }
      const buildOutput = this.run(
        'pnpm --filter @anton/protocol build && ' +
          'pnpm --filter @anton/agent-config build && ' +
          'pnpm --filter @anton/agent-core build && ' +
          'pnpm --filter @anton/agent-server build && ' +
          'pnpm --filter @anton/agent build',
        agentDir,
      )
      yield { stage: 'building', message: buildOutput }

      // 4. Write updated version.json
      const newHash = this.run('git rev-parse --short HEAD', agentDir).trim()
      const newVersion = this.run(
        'node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')).version)"',
        agentDir,
      ).trim()
      writeFileSync(
        join(getAntonDir(), 'version.json'),
        JSON.stringify({
          version: newVersion,
          gitHash: newHash,
          specVersion: SPEC_VERSION,
          branch: 'main',
          deployedAt: new Date().toISOString(),
          deployedBy: 'self-update',
        }),
      )

      // 5. Restart via systemd
      yield { stage: 'restarting', message: 'Restarting anton-agent service...' }
      try {
        this.run('sudo systemctl restart anton-agent', agentDir)
      } catch {
        // If not running under systemd, the process will just exit
        yield { stage: 'restarting', message: 'No systemd — process will exit. Restart manually or use a process manager.' }
      }

      // Clear cached manifest
      this.cachedManifest = null
      this.saveCachedManifest()

      yield { stage: 'done', message: `Updated to v${newVersion} (${newHash})` }
    } catch (err: unknown) {
      yield { stage: 'error', message: `Update failed: ${(err as Error).message}` }
    } finally {
      this.updating = false
    }
  }

  /** Get current update status for update_check_response */
  getStatus() {
    const manifest = this.getUpdateAvailable()
    return {
      currentVersion: VERSION,
      currentSpecVersion: SPEC_VERSION,
      latestVersion: manifest?.version ?? null,
      latestSpecVersion: manifest?.specVersion ?? null,
      updateAvailable: manifest !== null,
      changelog: manifest?.changelog ?? null,
      releaseUrl: manifest?.releaseUrl ?? null,
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private resolveAgentDir(): string | null {
    // Check common locations
    const candidates = [
      join(getAntonDir(), 'agent'), // deployed via Makefile sync
      '/opt/anton', // system install
    ]

    // Also try to find via git (if running from source)
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', { stdio: 'pipe' }).toString().trim()
      if (gitRoot && existsSync(join(gitRoot, 'package.json'))) {
        candidates.unshift(gitRoot)
      }
    } catch {}

    for (const dir of candidates) {
      if (existsSync(join(dir, 'package.json'))) {
        return dir
      }
    }
    return null
  }

  private run(cmd: string, cwd: string): string {
    return execSync(cmd, {
      cwd,
      stdio: 'pipe',
      timeout: 120_000,
      env: { ...process.env, FORCE_COLOR: '0' },
    }).toString()
  }

  private loadCachedManifest() {
    try {
      if (existsSync(CACHED_MANIFEST_PATH)) {
        this.cachedManifest = JSON.parse(readFileSync(CACHED_MANIFEST_PATH, 'utf-8'))
      }
    } catch {}
  }

  private saveCachedManifest() {
    try {
      if (this.cachedManifest) {
        writeFileSync(CACHED_MANIFEST_PATH, JSON.stringify(this.cachedManifest, null, 2))
      } else {
        // Clear the file
        writeFileSync(CACHED_MANIFEST_PATH, '{}')
      }
    } catch {}
  }
}
