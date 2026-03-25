/**
 * `anton machines` — manage saved machines.
 *
 *   anton machines              List all saved machines
 *   anton machines rm <name>    Remove a saved machine
 *   anton machines default <name>  Set default machine
 */

import { loadMachines, removeMachine, setDefaultMachine } from '../lib/machines.js'
import { ICONS, theme } from '../lib/theme.js'

export function machinesCommand(subcommand?: string, arg?: string): void {
  switch (subcommand) {
    case 'rm':
    case 'remove':
    case 'delete':
      removeMachineCommand(arg)
      break
    case 'default':
      setDefaultCommand(arg)
      break
    default:
      listMachines()
  }
}

function listMachines(): void {
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

  console.log(
    `\n  ${theme.dim('Commands: anton machines rm <name>, anton machines default <name>')}\n`,
  )
}

function removeMachineCommand(name?: string): void {
  if (!name) {
    console.log(`\n  Usage: ${theme.bold('anton machines rm <name>')}\n`)
    return
  }

  const machines = loadMachines()
  const match = machines.find((m) => m.name === name)

  if (!match) {
    console.log(`\n  Machine "${name}" not found.\n`)
    return
  }

  const removed = removeMachine(match.host, match.port)
  if (removed) {
    console.log(`\n  ${theme.success('✓')} Removed "${name}" (${match.host}:${match.port})\n`)
  } else {
    console.log(`\n  Failed to remove "${name}".\n`)
  }
}

function setDefaultCommand(name?: string): void {
  if (!name) {
    console.log(`\n  Usage: ${theme.bold('anton machines default <name>')}\n`)
    return
  }

  const machines = loadMachines()
  const match = machines.find((m) => m.name === name)

  if (!match) {
    console.log(`\n  Machine "${name}" not found.\n`)
    return
  }

  setDefaultMachine(match.host, match.port)
  console.log(`\n  ${theme.success('✓')} "${name}" is now the default machine.\n`)
}
