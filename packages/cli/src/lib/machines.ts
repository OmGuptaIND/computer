/**
 * Saved machine configs — stored in ~/.anton/machines.yaml
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface SavedMachine {
  name: string
  host: string
  port: number
  token: string
  useTLS: boolean
  default?: boolean
}

interface MachinesFile {
  machines: SavedMachine[]
}

const ANTON_DIR = join(homedir(), '.anton')
const MACHINES_PATH = join(ANTON_DIR, 'machines.yaml')

export function loadMachines(): SavedMachine[] {
  mkdirSync(ANTON_DIR, { recursive: true })
  if (!existsSync(MACHINES_PATH)) return []

  try {
    const raw = readFileSync(MACHINES_PATH, 'utf-8')
    const data = parseYaml(raw) as MachinesFile
    return data?.machines ?? []
  } catch {
    return []
  }
}

export function saveMachine(machine: SavedMachine): void {
  const machines = loadMachines()

  // Update existing or add new
  const existing = machines.findIndex((m) => m.host === machine.host && m.port === machine.port)
  if (existing >= 0) {
    machines[existing] = machine
  } else {
    machines.push(machine)
  }

  // If this is the default, clear others
  if (machine.default) {
    for (const m of machines) {
      if (m !== machine && m.host !== machine.host) {
        m.default = false
      }
    }
  }

  writeMachines(machines)
}

export function getDefaultMachine(): SavedMachine | null {
  const machines = loadMachines()
  return machines.find((m) => m.default) ?? machines[0] ?? null
}

export function setDefaultMachine(host: string, port: number): void {
  const machines = loadMachines()
  for (const m of machines) {
    m.default = m.host === host && m.port === port
  }
  writeMachines(machines)
}

export function removeMachine(host: string, port: number): boolean {
  const machines = loadMachines()
  const filtered = machines.filter((m) => !(m.host === host && m.port === port))
  if (filtered.length === machines.length) return false
  writeMachines(filtered)
  return true
}

function writeMachines(machines: SavedMachine[]): void {
  mkdirSync(ANTON_DIR, { recursive: true })
  writeFileSync(MACHINES_PATH, stringifyYaml({ machines }), 'utf-8')
}
