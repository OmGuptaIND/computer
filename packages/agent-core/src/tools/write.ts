/**
 * Write tool — create or overwrite files.
 *
 * Replaces filesystem "write" operation with a dedicated tool.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { checkForbiddenPath, getForbiddenPaths } from './security.js'

export interface WriteToolInput {
  file_path: string
  content: string
}

export function executeWrite(input: WriteToolInput): string {
  const { file_path, content } = input

  try {
    const forbidden = checkForbiddenPath(file_path, getForbiddenPaths())
    if (forbidden) return `Error: ${forbidden}`

    mkdirSync(dirname(file_path), { recursive: true })
    writeFileSync(file_path, content, 'utf-8')
    return `Wrote ${content.length} bytes to ${file_path}`
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}
