/**
 * Glob tool — fast file pattern matching.
 *
 * Finds files by name/glob pattern. Replaces filesystem "search" operation.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface GlobToolInput {
  pattern: string
  path?: string
}

export function executeGlob(input: GlobToolInput): string {
  const { pattern, path } = input
  const searchDir = path || '.'

  try {
    // Use execFileSync to avoid shell injection — arguments are passed as an array
    const args = [
      searchDir,
      '-maxdepth',
      '10',
      '-name',
      pattern,
      '-not',
      '-path',
      '*/node_modules/*',
      '-not',
      '-path',
      '*/.git/*',
      '-not',
      '-path',
      '*/dist/*',
      '-not',
      '-path',
      '*/build/*',
    ]
    const result = execFileSync('find', args, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    // Limit output to 100 entries
    const lines = result.split('\n').filter(Boolean).sort()
    return lines.slice(0, 100).join('\n') || 'No matching files found.'
  } catch {
    return 'No matching files found.'
  }
}

export interface ListToolInput {
  path: string
  maxDepth?: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`
}

export function executeList(input: ListToolInput): string {
  const { path } = input

  try {
    const entries = readdirSync(path, { withFileTypes: true })
    const lines = entries.map((e) => {
      try {
        const stat = statSync(join(path, e.name))
        const type = e.isDirectory() ? 'dir' : 'file'
        const size = e.isDirectory() ? '-' : formatSize(stat.size)
        return `${type}\t${size}\t${e.name}`
      } catch {
        return `?\t?\t${e.name}`
      }
    })
    return lines.join('\n') || '(empty directory)'
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}

export function executeTree(input: ListToolInput): string {
  const { path, maxDepth = 3 } = input

  try {
    const args = [path, '-maxdepth', String(maxDepth), '-print']
    const result = execFileSync('find', args, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const lines = result.trim().split('\n').filter(Boolean).sort()
    return lines.slice(0, 200).join('\n') || '(empty)'
  } catch {
    return `Error: could not list ${path}`
  }
}
