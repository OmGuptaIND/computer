/**
 * `anton computer doctor` — diagnose and fix common machine setup issues.
 *
 * Runs a series of checks and reports their status. With --fix, attempts
 * to remediate issues automatically. This is the escape hatch when something
 * has drifted on a machine and updates aren't working.
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ICONS, theme } from '../lib/theme.js'
import {
  AGENT_SERVICE,
  AGENT_SERVICE_PATH,
  ANTON_USER,
  DEFAULT_PORT,
  DEFAULT_SIDECAR_PORT,
  ENV_FILE,
  REPO_DIR,
  SIDECAR_BIN,
  SIDECAR_SERVICE,
  SIDECAR_SERVICE_PATH,
  execSilent,
  readPortFromService,
  requireLinuxRoot,
  sidecarServiceUnit,
} from './computer-common.js'

type CheckStatus = 'ok' | 'warn' | 'error' | 'skip'
type CheckResult = {
  name: string
  status: CheckStatus
  detail?: string
  fix?: () => boolean | Promise<boolean>
  fixDescription?: string
}

const AGENT_ENTRY = `${REPO_DIR}/packages/agent-server/dist/index.js`
const CONFIG_PATH = `/home/${ANTON_USER}/.anton/config.yaml`

export async function computerDoctorCommand(args: { fix?: boolean }): Promise<void> {
  requireLinuxRoot()

  const fixMode = args.fix ?? false

  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— doctor')}`)
  console.log()

  const checks: CheckResult[] = []

  // Run all checks
  checks.push(checkRepoExists())
  checks.push(checkAgentEntry())
  checks.push(checkAgentService())
  checks.push(checkAgentRunning())
  checks.push(checkSidecarBinary())
  checks.push(checkSidecarService())
  checks.push(checkSidecarServiceFile())
  checks.push(checkSidecarRunning())
  checks.push(checkConfigYaml())
  checks.push(checkEnvFile())
  checks.push(checkTokenSync())
  checks.push(await checkAgentHealth())
  checks.push(await checkSidecarHealth())
  checks.push(await checkSidecarAuth())

  // Print results
  let errors = 0
  let warns = 0
  for (const check of checks) {
    printCheck(check)
    if (check.status === 'error') errors++
    if (check.status === 'warn') warns++
  }

  console.log()

  // Apply fixes if requested
  if (fixMode && (errors > 0 || warns > 0)) {
    console.log(`  ${theme.bold('Applying fixes...')}`)
    console.log()

    for (const check of checks) {
      if ((check.status === 'error' || check.status === 'warn') && check.fix) {
        process.stdout.write(
          `  ${theme.dim('○')} ${check.fixDescription ?? `Fixing ${check.name}`}...`,
        )
        try {
          const result = await check.fix()
          if (result) {
            process.stdout.write(
              `\r  ${ICONS.toolDone} ${check.fixDescription ?? `Fixed ${check.name}`}\n`,
            )
          } else {
            process.stdout.write(
              `\r  ${ICONS.toolError} ${check.fixDescription ?? check.name} ${theme.dim('(could not fix)')}\n`,
            )
          }
        } catch (err) {
          process.stdout.write(
            `\r  ${ICONS.toolError} ${check.fixDescription ?? check.name} ${theme.dim((err as Error).message)}\n`,
          )
        }
      }
    }

    console.log()
    console.log(
      `  ${theme.dim('Re-run')} ${theme.bold('anton computer doctor')} ${theme.dim('to verify')}`,
    )
    console.log()
    return
  }

  // Summary
  if (errors === 0 && warns === 0) {
    console.log(`  ${theme.success('All checks passed.')}`)
  } else {
    if (errors > 0) {
      console.log(
        `  ${theme.error(`${errors} error${errors > 1 ? 's' : ''}`)}${warns > 0 ? `, ${theme.warning(`${warns} warning${warns > 1 ? 's' : ''}`)}` : ''}`,
      )
    } else {
      console.log(`  ${theme.warning(`${warns} warning${warns > 1 ? 's' : ''}`)}`)
    }
    console.log()
    console.log(
      `  ${theme.dim('Run')} ${theme.bold('sudo anton computer doctor --fix')} ${theme.dim('to attempt automatic remediation')}`,
    )
  }
  console.log()
}

// ── Print helper ────────────────────────────────────────────────

function printCheck(c: CheckResult): void {
  const icons = {
    ok: theme.success('✓'),
    warn: theme.warning('!'),
    error: theme.error('✗'),
    skip: theme.dim('-'),
  }
  const detail = c.detail ? `  ${theme.dim(c.detail)}` : ''
  console.log(`  ${icons[c.status]} ${c.name}${detail}`)
}

// ── Checks ──────────────────────────────────────────────────────

function checkRepoExists(): CheckResult {
  if (existsSync(`${REPO_DIR}/.git`)) {
    return { name: 'Repo at /opt/anton', status: 'ok' }
  }
  return {
    name: 'Repo at /opt/anton',
    status: 'error',
    detail: 'not found — run anton computer setup',
  }
}

function checkAgentEntry(): CheckResult {
  if (existsSync(AGENT_ENTRY)) {
    return { name: 'Agent built (dist/index.js)', status: 'ok' }
  }
  return {
    name: 'Agent built (dist/index.js)',
    status: 'error',
    detail: 'missing — needs build',
    fixDescription: 'Building agent',
    fix: () => {
      try {
        execSync(
          `sudo -u ${ANTON_USER} bash -c "cd ${REPO_DIR} && CI=true pnpm install && pnpm -r build"`,
          {
            stdio: 'pipe',
            timeout: 300_000,
          },
        )
        return existsSync(AGENT_ENTRY)
      } catch {
        return false
      }
    },
  }
}

function checkAgentService(): CheckResult {
  if (existsSync(AGENT_SERVICE_PATH)) {
    return { name: 'Agent systemd service installed', status: 'ok' }
  }
  return {
    name: 'Agent systemd service installed',
    status: 'error',
    detail: 'service file missing — run anton computer setup',
  }
}

function checkAgentRunning(): CheckResult {
  if (execSilent(`systemctl is-active --quiet ${AGENT_SERVICE}`)) {
    return { name: 'Agent service active', status: 'ok' }
  }
  return {
    name: 'Agent service active',
    status: 'error',
    detail: 'not running',
    fixDescription: 'Starting agent',
    fix: () => execSilent(`systemctl start ${AGENT_SERVICE}`),
  }
}

function checkSidecarBinary(): CheckResult {
  if (existsSync(SIDECAR_BIN)) {
    return { name: 'Sidecar binary installed', status: 'ok' }
  }
  return {
    name: 'Sidecar binary installed',
    status: 'error',
    detail: 'binary missing — run anton computer sidecar',
  }
}

function checkSidecarService(): CheckResult {
  if (existsSync(SIDECAR_SERVICE_PATH)) {
    return { name: 'Sidecar systemd service installed', status: 'ok' }
  }
  return {
    name: 'Sidecar systemd service installed',
    status: 'error',
    detail: 'service file missing',
    fixDescription: 'Creating sidecar service file',
    fix: () => {
      try {
        const port = readPortFromService() ?? DEFAULT_PORT
        writeFileSync(SIDECAR_SERVICE_PATH, sidecarServiceUnit(port, DEFAULT_SIDECAR_PORT))
        execSync('systemctl daemon-reload', { stdio: 'pipe' })
        execSync(`systemctl enable ${SIDECAR_SERVICE}`, { stdio: 'pipe' })
        return true
      } catch {
        return false
      }
    },
  }
}

function checkSidecarServiceFile(): CheckResult {
  if (!existsSync(SIDECAR_SERVICE_PATH)) {
    return { name: 'Sidecar service has EnvironmentFile', status: 'skip' }
  }
  try {
    const content = readFileSync(SIDECAR_SERVICE_PATH, 'utf-8')
    if (/^EnvironmentFile=/m.test(content)) {
      return { name: 'Sidecar service has EnvironmentFile', status: 'ok' }
    }
    return {
      name: 'Sidecar service has EnvironmentFile',
      status: 'error',
      detail: 'missing EnvironmentFile directive',
      fixDescription: 'Rewriting sidecar service file',
      fix: () => {
        try {
          const port = readPortFromService() ?? DEFAULT_PORT
          writeFileSync(SIDECAR_SERVICE_PATH, sidecarServiceUnit(port, DEFAULT_SIDECAR_PORT))
          execSync('systemctl daemon-reload', { stdio: 'pipe' })
          execSync(`systemctl restart ${SIDECAR_SERVICE}`, { stdio: 'pipe' })
          return true
        } catch {
          return false
        }
      },
    }
  } catch {
    return { name: 'Sidecar service has EnvironmentFile', status: 'error', detail: 'unreadable' }
  }
}

function checkSidecarRunning(): CheckResult {
  if (execSilent(`systemctl is-active --quiet ${SIDECAR_SERVICE}`)) {
    return { name: 'Sidecar service active', status: 'ok' }
  }
  return {
    name: 'Sidecar service active',
    status: 'error',
    detail: 'not running (check logs: anton computer logs sidecar)',
    fixDescription: 'Starting sidecar',
    fix: () => execSilent(`systemctl start ${SIDECAR_SERVICE}`),
  }
}

function checkConfigYaml(): CheckResult {
  if (existsSync(CONFIG_PATH)) {
    return { name: 'config.yaml exists', status: 'ok' }
  }
  return {
    name: 'config.yaml exists',
    status: 'error',
    detail: `not found at ${CONFIG_PATH}`,
  }
}

function checkEnvFile(): CheckResult {
  if (existsSync(ENV_FILE)) {
    return { name: 'agent.env exists', status: 'ok' }
  }
  return {
    name: 'agent.env exists',
    status: 'error',
    detail: `not found at ${ENV_FILE}`,
  }
}

function readConfigToken(): string | null {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    const match = content.match(/^token:\s*(?:["']?)(.+?)(?:["']?)\s*$/m)
    return match?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function readEnvToken(): string | null {
  try {
    if (!existsSync(ENV_FILE)) return null
    const content = readFileSync(ENV_FILE, 'utf-8')
    const match = content.match(/^ANTON_TOKEN=(.+)$/m)
    return match?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

function checkTokenSync(): CheckResult {
  const configToken = readConfigToken()
  const envToken = readEnvToken()

  const fixWith = (token: string | null) => () => {
    try {
      if (!token) return false
      syncToken(token)
      syncConfigYamlToken(token)
      execSilent(`systemctl restart ${SIDECAR_SERVICE}`)
      execSilent(`systemctl restart ${AGENT_SERVICE}`)
      return true
    } catch {
      return false
    }
  }

  if (!configToken && !envToken) {
    return { name: 'Token consistency', status: 'error', detail: 'no token in either file' }
  }

  if (configToken && !envToken) {
    return {
      name: 'Token consistency',
      status: 'error',
      detail: 'config.yaml has token, agent.env does not',
      fixDescription: 'Writing token from config.yaml to agent.env',
      fix: fixWith(configToken),
    }
  }

  if (!configToken && envToken) {
    return {
      name: 'Token consistency',
      status: 'error',
      detail: 'agent.env has token, config.yaml does not',
      fixDescription: 'Writing token from agent.env to config.yaml',
      fix: fixWith(envToken),
    }
  }

  if (configToken !== envToken) {
    return {
      name: 'Token consistency',
      status: 'error',
      detail: 'config.yaml and agent.env have different tokens',
      fixDescription: 'Syncing tokens (env wins, both files updated)',
      // Env wins since systemd loads it for both processes
      fix: fixWith(envToken),
    }
  }

  return { name: 'Token consistency', status: 'ok' }
}

function syncToken(token: string): void {
  let content = ''
  if (existsSync(ENV_FILE)) {
    content = readFileSync(ENV_FILE, 'utf-8')
  }
  // Strip ALL existing ANTON_TOKEN= lines (handles duplicates from past bad state)
  content = content.replace(/^ANTON_TOKEN=.*\n?/gm, '')
  content = content.endsWith('\n') || content === '' ? content : `${content}\n`
  content += `ANTON_TOKEN=${token}\n`
  writeFileSync(ENV_FILE, content, { mode: 0o600 })
  execSilent(`chown ${ANTON_USER}:${ANTON_USER} ${ENV_FILE}`)
}

function syncConfigYamlToken(token: string): void {
  if (!existsSync(CONFIG_PATH)) return
  let content = readFileSync(CONFIG_PATH, 'utf-8')
  if (/^token:\s*.*$/m.test(content)) {
    content = content.replace(/^token:\s*.*$/m, `token: ${token}`)
  } else {
    content = content.endsWith('\n') ? content : `${content}\n`
    content += `token: ${token}\n`
  }
  writeFileSync(CONFIG_PATH, content, 'utf-8')
  execSilent(`chown ${ANTON_USER}:${ANTON_USER} ${CONFIG_PATH}`)
}

async function checkAgentHealth(): Promise<CheckResult> {
  const port = readPortFromService() ?? DEFAULT_PORT
  try {
    const res = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (res.ok) {
      const body = (await res.json()) as { version?: string }
      return {
        name: 'Agent /health',
        status: 'ok',
        detail: body.version ? `v${body.version}` : undefined,
      }
    }
    return { name: 'Agent /health', status: 'error', detail: `HTTP ${res.status}` }
  } catch (err) {
    return {
      name: 'Agent /health',
      status: 'error',
      detail: (err as Error).message,
    }
  }
}

async function checkSidecarHealth(): Promise<CheckResult> {
  try {
    const res = await fetch(`http://localhost:${DEFAULT_SIDECAR_PORT}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (res.ok) {
      return { name: 'Sidecar /health', status: 'ok' }
    }
    return { name: 'Sidecar /health', status: 'error', detail: `HTTP ${res.status}` }
  } catch (err) {
    return {
      name: 'Sidecar /health',
      status: 'error',
      detail: (err as Error).message,
    }
  }
}

async function checkSidecarAuth(): Promise<CheckResult> {
  const token = readEnvToken()
  if (!token) {
    return {
      name: 'Sidecar /update/check (auth)',
      status: 'skip',
      detail: 'no token to test with',
    }
  }
  try {
    const res = await fetch(`http://localhost:${DEFAULT_SIDECAR_PORT}/update/check`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      return { name: 'Sidecar /update/check (auth)', status: 'ok' }
    }
    if (res.status === 401) {
      return {
        name: 'Sidecar /update/check (auth)',
        status: 'error',
        detail: 'sidecar rejected token (401) — sidecar binary may be outdated',
      }
    }
    if (res.status === 503) {
      return {
        name: 'Sidecar /update/check (auth)',
        status: 'error',
        detail: 'sidecar has no ANTON_TOKEN configured (503)',
      }
    }
    return {
      name: 'Sidecar /update/check (auth)',
      status: 'error',
      detail: `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      name: 'Sidecar /update/check (auth)',
      status: 'error',
      detail: (err as Error).message,
    }
  }
}
