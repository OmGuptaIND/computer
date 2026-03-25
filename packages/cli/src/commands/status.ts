/**
 * `anton status` — show agent + sidecar health info.
 *
 * Checks both the WebSocket agent connection and the sidecar HTTP endpoint.
 */

import { Connection } from '../lib/connection.js'
import { getDefaultMachine } from '../lib/machines.js'
import { ICONS, theme } from '../lib/theme.js'

interface SidecarStatus {
  status: string
  agent: { healthy: boolean }
  caddy: { running: boolean }
  system: {
    cpuPercent: number
    memUsedMB: number
    memTotalMB: number
    diskUsedGB: number
    diskTotalGB: number
    uptimeSeconds: number
  }
  version: string
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (hours < 24) return `${hours}h ${remainMins}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function check(ok: boolean): string {
  return ok ? theme.success('✓') : theme.error('✗')
}

async function fetchSidecarUrl(url: string): Promise<SidecarStatus | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return (await res.json()) as SidecarStatus
  } catch {
    return null
  }
}

export async function statusCommand(host?: string, port?: number): Promise<void> {
  const machine = getDefaultMachine()

  const targetHost = host ?? machine?.host
  const targetPort = port ?? machine?.port ?? 9876
  const token = machine?.token

  if (!targetHost || !token) {
    console.log(`\n  No machine configured. Run ${theme.bold('anton connect <host>')} first.\n`)
    process.exit(1)
  }

  const machineName = machine?.name ?? targetHost
  console.log(`\n  ${theme.bold(machineName)}`)
  console.log(`  ${'─'.repeat(50)}`)

  // 1. Agent WebSocket check
  console.log(`\n  ${ICONS.connecting} Checking agent...`)
  const conn = new Connection()
  const wsStart = Date.now()
  let agentOnline = false

  try {
    await conn.connect({
      host: targetHost,
      port: targetPort,
      token: token!,
      useTLS: machine?.useTLS ?? false,
    })
    agentOnline = true
    const latency = Date.now() - wsStart

    console.log(`  ${check(true)} Agent ${theme.success('online')}`)
    console.log(`     ID:       ${conn.agentId}`)
    console.log(`     Version:  ${conn.agentVersion}`)
    console.log(`     Latency:  ${latency}ms`)
    conn.disconnect()
  } catch (err: unknown) {
    console.log(`  ${check(false)} Agent ${theme.error('offline')} — ${(err as Error).message}`)
  }

  // 2. Sidecar check
  // The sidecar is behind Caddy on the domain — try the host directly,
  // or if host is an IP, try hitting it on port 9878 directly.
  let domain: string | null = null
  if (targetHost.includes('antoncomputer.in')) {
    domain = targetHost
  } else {
    // Host might be an IP — try hitting sidecar directly on port 9878
    domain = null
  }
  const sidecarUrl = domain ? `https://${domain}/_anton/status` : `http://${targetHost}:9878/status`

  {
    console.log(`\n  ${ICONS.connecting} Checking sidecar...`)
    const sidecar = await fetchSidecarUrl(sidecarUrl)

    if (sidecar) {
      console.log(`  ${check(true)} Sidecar ${theme.success(sidecar.status)}  v${sidecar.version}`)
      console.log()
      console.log(`  ${theme.bold('Services')}`)
      console.log(
        `     Agent:    ${check(sidecar.agent.healthy)} ${sidecar.agent.healthy ? 'healthy' : 'unhealthy'}`,
      )
      console.log(
        `     Caddy:    ${check(sidecar.caddy.running)} ${sidecar.caddy.running ? 'running' : 'stopped'}`,
      )
      console.log()
      console.log(`  ${theme.bold('System')}`)
      console.log(`     Memory:   ${sidecar.system.memUsedMB}MB / ${sidecar.system.memTotalMB}MB`)
      console.log(`     Disk:     ${sidecar.system.diskUsedGB}GB / ${sidecar.system.diskTotalGB}GB`)
      console.log(`     Uptime:   ${formatUptime(sidecar.system.uptimeSeconds)}`)
    } else {
      console.log(`  ${check(false)} Sidecar ${theme.error('unreachable')}`)
      console.log(`     Could not reach ${sidecarUrl}`)
    }
  }

  console.log()

  if (!agentOnline) process.exit(1)
}
