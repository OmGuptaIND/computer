/**
 * Clipboard tool — read from and write to the system clipboard.
 * Uses pbcopy/pbpaste on macOS, xclip on Linux.
 */

import { execSync } from 'node:child_process'
import { platform } from 'node:os'

export interface ClipboardInput {
  operation: 'read' | 'write'
  content?: string
}

export function executeClipboard(input: ClipboardInput): string {
  const os = platform()

  switch (input.operation) {
    case 'read': {
      try {
        const cmd = os === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o'
        const content = execSync(cmd, { encoding: 'utf-8', timeout: 5_000 })
        if (!content.trim()) return '(clipboard is empty)'
        return content
      } catch (err: unknown) {
        return `Error reading clipboard: ${(err as Error).message}`
      }
    }

    case 'write': {
      if (!input.content) return 'Error: content is required for write.'
      try {
        const cmd = os === 'darwin' ? 'pbcopy' : 'xclip -selection clipboard'
        execSync(cmd, { input: input.content, encoding: 'utf-8', timeout: 5_000 })
        return `Copied ${input.content.length} characters to clipboard.`
      } catch (err: unknown) {
        return `Error writing to clipboard: ${(err as Error).message}`
      }
    }

    default:
      return `Error: unknown operation "${input.operation}".`
  }
}
