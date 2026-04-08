/**
 * Read tool — read file contents with line numbers.
 *
 * Replaces filesystem "read" operation with a dedicated, Claude Code-inspired tool.
 */

import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { checkForbiddenPath, getForbiddenPaths } from './security.js'

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.heic',
  '.heif',
])

export interface ReadToolInput {
  file_path: string
  offset?: number
  limit?: number
}

export function executeRead(input: ReadToolInput): string {
  const { file_path, offset, limit } = input

  try {
    const forbidden = checkForbiddenPath(file_path, getForbiddenPaths())
    if (forbidden) return `Error: ${forbidden}`

    const ext = extname(file_path).toLowerCase()
    if (IMAGE_EXTS.has(ext)) {
      const stat = statSync(file_path)
      const name = basename(file_path)
      const sizeKB = Math.round(stat.size / 1024)
      return `[Image file: ${name} | Size: ${sizeKB}KB]\nCannot display image content in text. The image was already shown in the conversation when uploaded.`
    }

    const data = readFileSync(file_path, 'utf-8')
    const lines = data.split('\n')

    // Apply offset and limit
    const startLine = offset ? Math.max(0, offset - 1) : 0
    const maxLines = limit ?? 2000
    const endLine = Math.min(lines.length, startLine + maxLines)
    const slice = lines.slice(startLine, endLine)

    // Format with line numbers (cat -n style)
    const numbered = slice.map((line, i) => {
      const lineNum = startLine + i + 1
      return `${String(lineNum).padStart(6)}  ${line}`
    })

    let result = numbered.join('\n')

    if (endLine < lines.length) {
      result += `\n\n... (${lines.length - endLine} more lines. Use offset=${endLine + 1} to continue reading)`
    }

    return result
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}
