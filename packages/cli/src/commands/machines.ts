/**
 * `anton machines` — list saved machines.
 */

import { loadMachines } from '../lib/machines.js'
import { ICONS, theme } from '../lib/theme.js'

export function machinesCommand(): void {
  const machines = loadMachines()

  if (machines.length === 0) {
    console.log(`\n  No saved machines. Run ${theme.bold('anton connect <host>')} to add one.\n`)
    return
  }

  console.log(`\n  ${theme.bold('Saved Machines')}\n`)

  for (const m of machines) {
    const icon = m.default ? ICONS.connected : ICONS.disconnected
    const def = m.default ? theme.brand(' (default)') : ''
    const tls = m.useTLS ? ' [TLS]' : ''
    console.log(`  ${icon} ${theme.bold(m.name)}${def}  ${theme.dim(`${m.host}:${m.port}${tls}`)}`)
    console.log(`    ${theme.dim(`token: ${m.token.slice(0, 8)}...`)}`)
  }

  console.log()
}
