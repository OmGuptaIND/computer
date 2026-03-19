/**
 * `anton status` — ping agent and show info.
 */

import { Connection } from '../lib/connection.js'
import { getDefaultMachine } from '../lib/machines.js'
import { ICONS, theme } from '../lib/theme.js'

export async function statusCommand(host?: string, port?: number): Promise<void> {
  const machine = getDefaultMachine()

  const targetHost = host ?? machine?.host
  const targetPort = port ?? machine?.port ?? 9876
  const token = machine?.token

  if (!targetHost || !token) {
    console.log(`\n  No machine configured. Run ${theme.bold('anton connect <host>')} first.\n`)
    process.exit(1)
  }

  console.log(`\n  ${ICONS.connecting} Pinging ${targetHost}:${targetPort}...`)

  const conn = new Connection()
  const start = Date.now()

  try {
    await conn.connect({
      host: targetHost,
      port: targetPort,
      token: token!,
      useTLS: machine?.useTLS ?? false,
    })

    const latency = Date.now() - start

    console.log(`  ${ICONS.connected} ${theme.success('Online')}`)
    console.log(`  Agent ID:  ${conn.agentId}`)
    console.log(`  Version:   ${conn.agentVersion}`)
    console.log(`  Latency:   ${latency}ms`)
    console.log(`  Machine:   ${machine?.name ?? targetHost}`)
    console.log()

    conn.disconnect()
  } catch (err: unknown) {
    console.log(`  ${ICONS.disconnected} ${theme.error('Offline')} — ${(err as Error).message}\n`)
    process.exit(1)
  }
}
