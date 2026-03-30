/**
 * `anton computer stop|start|restart|status|uninstall`
 *
 * Lifecycle management for the anton agent + sidecar on this machine.
 */

import { execSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { ICONS, theme } from '../lib/theme.js'
import {
  AGENT_BIN,
  AGENT_SERVICE,
  AGENT_SERVICE_PATH,
  ANTON_DIR,
  ANTON_USER,
  ENV_FILE,
  SIDECAR_BIN,
  SIDECAR_SERVICE,
  SIDECAR_SERVICE_PATH,
  done,
  exec,
  execSilent,
  fail,
  getServiceStatus,
  maskToken,
  promptInput,
  readPortFromService,
  readTokenFromEnv,
  requireLinuxRoot,
  step,
} from './computer-common.js'

// ── Status ──────────────────────────────────────────────────────

export async function computerStatusCommand(): Promise<void> {
  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— status')}`)
  console.log()

  const agentStatus = getServiceStatus(AGENT_SERVICE)
  const sidecarStatus = getServiceStatus(SIDECAR_SERVICE)
  const token = readTokenFromEnv()
  const port = readPortFromService()

  // Agent
  if (agentStatus) {
    const icon = agentStatus.active ? ICONS.connected : ICONS.disconnected
    const stateText = agentStatus.active
      ? theme.success(agentStatus.status)
      : theme.error(agentStatus.status)
    const details = [
      agentStatus.pid ? `pid ${agentStatus.pid}` : null,
      agentStatus.uptime ? `uptime ${agentStatus.uptime}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(
      `  ${icon} ${theme.label('Agent')}:     ${stateText}${details ? `  ${theme.dim(`(${details})`)}` : ''}`,
    )
  } else {
    console.log(
      `  ${ICONS.disconnected} ${theme.label('Agent')}:     ${theme.dim('not installed')}`,
    )
  }

  // Sidecar
  if (sidecarStatus) {
    const icon = sidecarStatus.active ? ICONS.connected : ICONS.disconnected
    const stateText = sidecarStatus.active
      ? theme.success(sidecarStatus.status)
      : theme.error(sidecarStatus.status)
    const details = [
      sidecarStatus.pid ? `pid ${sidecarStatus.pid}` : null,
      sidecarStatus.uptime ? `uptime ${sidecarStatus.uptime}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(
      `  ${icon} ${theme.label('Sidecar')}:   ${stateText}${details ? `  ${theme.dim(`(${details})`)}` : ''}`,
    )
  } else {
    console.log(
      `  ${ICONS.disconnected} ${theme.label('Sidecar')}:   ${theme.dim('not installed')}`,
    )
  }

  console.log()

  // Info
  if (port) {
    console.log(`  ${theme.label('Port')}:      ${port}`)
  }
  if (token) {
    console.log(`  ${theme.label('Token')}:     ${maskToken(token)}`)
  }

  // Health check
  if (agentStatus?.active && port) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (res.ok) {
        console.log(`  ${theme.label('Health')}:    ${theme.success('✓ responding')}`)
      } else {
        console.log(`  ${theme.label('Health')}:    ${theme.warning(`HTTP ${res.status}`)}`)
      }
    } catch {
      console.log(`  ${theme.label('Health')}:    ${theme.error('✗ not responding')}`)
    }
  }

  console.log()
}

// ── Stop ────────────────────────────────────────────────────────

export async function computerStopCommand(): Promise<void> {
  requireLinuxRoot()

  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— stop')}`)
  console.log()

  step('Stopping agent')
  if (execSilent(`systemctl stop ${AGENT_SERVICE}`)) {
    done('Agent stopped')
  } else {
    done('Agent', 'not running')
  }

  step('Stopping sidecar')
  if (execSilent(`systemctl stop ${SIDECAR_SERVICE}`)) {
    done('Sidecar stopped')
  } else {
    done('Sidecar', 'not running')
  }

  console.log()
}

// ── Start ───────────────────────────────────────────────────────

export async function computerStartCommand(): Promise<void> {
  requireLinuxRoot()

  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— start')}`)
  console.log()

  step('Starting agent')
  if (existsSync(AGENT_SERVICE_PATH)) {
    try {
      exec(`systemctl start ${AGENT_SERVICE}`)
      done('Agent started')
    } catch (err) {
      fail('Agent start', (err as Error).message)
    }
  } else {
    fail('Agent', 'not installed — run anton computer setup first')
  }

  step('Starting sidecar')
  if (existsSync(SIDECAR_SERVICE_PATH)) {
    try {
      exec(`systemctl start ${SIDECAR_SERVICE}`)
      done('Sidecar started')
    } catch (err) {
      fail('Sidecar start', (err as Error).message)
    }
  } else {
    done('Sidecar', 'not installed')
  }

  console.log()
}

// ── Restart ─────────────────────────────────────────────────────

export async function computerRestartCommand(): Promise<void> {
  requireLinuxRoot()

  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— restart')}`)
  console.log()

  step('Restarting agent')
  if (existsSync(AGENT_SERVICE_PATH)) {
    try {
      exec(`systemctl restart ${AGENT_SERVICE}`)
      done('Agent restarted')
    } catch (err) {
      fail('Agent restart', (err as Error).message)
    }
  } else {
    fail('Agent', 'not installed')
  }

  step('Restarting sidecar')
  if (existsSync(SIDECAR_SERVICE_PATH)) {
    try {
      exec(`systemctl restart ${SIDECAR_SERVICE}`)
      done('Sidecar restarted')
    } catch (err) {
      fail('Sidecar restart', (err as Error).message)
    }
  } else {
    done('Sidecar', 'not installed')
  }

  console.log()
}

// ── Uninstall ───────────────────────────────────────────────────

export async function computerUninstallCommand(args: {
  yes?: boolean
  purge?: boolean
}): Promise<void> {
  requireLinuxRoot()

  console.log()
  console.log(`  ${theme.brandBold('anton.computer')} ${theme.dim('— uninstall')}`)
  console.log()

  if (!args.yes) {
    console.log('  This will:')
    console.log(`    ${theme.dim('•')} Stop and disable agent + sidecar services`)
    console.log(`    ${theme.dim('•')} Remove binaries and service files`)
    console.log(`    ${theme.dim('•')} Remove environment config`)
    if (args.purge) {
      console.log(
        `    ${theme.dim('•')} ${theme.warning('Delete anton user and all data')} ${theme.dim(`(${ANTON_DIR})`)}`,
      )
    }
    console.log()

    const confirm = await promptInput(`  ${theme.bold('Continue?')} ${theme.dim('(y/N)')}: `)
    if (confirm.toLowerCase() !== 'y') {
      console.log(`\n  ${theme.dim('Aborted.')}\n`)
      process.exit(0)
    }
    console.log()
  }

  // Stop + disable services
  step('Stopping services')
  execSilent(`systemctl stop ${AGENT_SERVICE}`)
  execSilent(`systemctl stop ${SIDECAR_SERVICE}`)
  execSilent(`systemctl disable ${AGENT_SERVICE}`)
  execSilent(`systemctl disable ${SIDECAR_SERVICE}`)
  done('Services stopped')

  // Remove service files
  step('Removing service files')
  for (const f of [AGENT_SERVICE_PATH, SIDECAR_SERVICE_PATH]) {
    try {
      if (existsSync(f)) unlinkSync(f)
    } catch {}
  }
  execSilent('systemctl daemon-reload')
  done('Service files removed')

  // Remove binaries
  step('Removing binaries')
  for (const f of [AGENT_BIN, SIDECAR_BIN]) {
    try {
      if (existsSync(f)) unlinkSync(f)
    } catch {}
  }
  done('Binaries removed')

  // Remove env file
  step('Removing environment config')
  try {
    if (existsSync(ENV_FILE)) unlinkSync(ENV_FILE)
  } catch {}
  done('Environment config removed')

  // Purge user + data
  if (args.purge) {
    step('Removing anton user and data')
    execSilent(`userdel -r ${ANTON_USER}`)
    done('User and data removed')
  }

  console.log()
  console.log(`  ${theme.success('Uninstall complete.')}`)
  if (!args.purge) {
    console.log(`  ${theme.dim(`User "${ANTON_USER}" and data in ${ANTON_DIR} were preserved.`)}`)
    console.log(`  ${theme.dim('To remove everything: anton computer uninstall --purge')}`)
  }
  console.log()
}

// ── Logs ────────────────────────────────────────────────────────

export async function computerLogsCommand(args: {
  target?: string
  follow?: boolean
  lines?: number
}): Promise<void> {
  const target = args.target ?? 'agent'
  const lines = args.lines ?? 50
  const follow = args.follow ?? false

  const validTargets: Record<string, { unit?: string; file?: string; label: string }> = {
    agent: { unit: AGENT_SERVICE, label: 'Agent' },
    sidecar: { unit: SIDECAR_SERVICE, label: 'Sidecar' },
    deploy: { file: '/var/log/anton-init.log', label: 'Deployment' },
    all: { label: 'All' },
  }

  const config = validTargets[target]
  if (!config) {
    console.log()
    console.log(`  ${theme.error(`Unknown log target: ${target}`)}`)
    console.log()
    console.log('  Usage:')
    console.log(`    ${theme.brand('anton computer logs')}               Agent logs (default)`)
    console.log(`    ${theme.brand('anton computer logs sidecar')}       Sidecar logs`)
    console.log(`    ${theme.brand('anton computer logs deploy')}        Deployment logs`)
    console.log(`    ${theme.brand('anton computer logs all')}           Agent + sidecar combined`)
    console.log(`      ${theme.dim('-f')}                               Follow (tail -f)`)
    console.log(
      `      ${theme.dim('-n <lines>')}                       Number of lines (default: 50)`,
    )
    console.log()
    process.exit(1)
  }

  // Deploy logs come from a file, not systemd
  if (config.file) {
    if (!existsSync(config.file)) {
      console.log(`\n  ${theme.dim('No deployment logs found.')}\n`)
      return
    }
    const cmd = follow ? `tail -f "${config.file}"` : `tail -n ${lines} "${config.file}"`
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      // tail returns non-zero on ctrl+c, that's fine
    }
    return
  }

  // All = agent + sidecar combined
  if (target === 'all') {
    const followFlag = follow ? '-f' : ''
    const cmd = `journalctl -u ${AGENT_SERVICE} -u ${SIDECAR_SERVICE} --no-pager -n ${lines} ${followFlag}`
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      // journalctl returns non-zero on ctrl+c
    }
    return
  }

  // Single service logs
  if (config.unit) {
    const followFlag = follow ? '-f' : ''
    const cmd = `journalctl -u ${config.unit} --no-pager -n ${lines} ${followFlag}`
    try {
      execSync(cmd, { stdio: 'inherit' })
    } catch {
      // journalctl returns non-zero on ctrl+c
    }
  }
}
