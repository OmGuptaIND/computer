/**
 * Edit tool — exact string replacement in files.
 *
 * Inspired by Claude Code's FileEditTool. Performs precise edits
 * by finding and replacing exact string matches in a file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { checkForbiddenPath, getForbiddenPaths } from './security.js'

export interface EditToolInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export function executeEdit(input: EditToolInput): string {
  const { file_path, old_string, new_string, replace_all = false } = input

  try {
    const forbidden = checkForbiddenPath(file_path, getForbiddenPaths())
    if (forbidden) return `Error: ${forbidden}`

    if (old_string === new_string) {
      return 'Error: old_string and new_string are identical. No changes needed.'
    }

    const content = readFileSync(file_path, 'utf-8')

    if (!content.includes(old_string)) {
      return `Error: old_string not found in ${file_path}. Make sure the string matches exactly, including whitespace and indentation.`
    }

    let newContent: string
    let replacementCount: number

    if (replace_all) {
      const parts = content.split(old_string)
      replacementCount = parts.length - 1
      newContent = parts.join(new_string)
    } else {
      // Check uniqueness — must appear exactly once
      const firstIndex = content.indexOf(old_string)
      const secondIndex = content.indexOf(old_string, firstIndex + 1)

      if (secondIndex !== -1) {
        let count = 0
        let searchFrom = 0
        while (true) {
          const idx = content.indexOf(old_string, searchFrom)
          if (idx === -1) break
          count++
          searchFrom = idx + 1
        }
        return `Error: old_string appears ${count} times in ${file_path}. Provide a larger string with more surrounding context to make it unique, or use replace_all to replace all occurrences.`
      }

      replacementCount = 1
      newContent =
        content.slice(0, firstIndex) + new_string + content.slice(firstIndex + old_string.length)
    }

    writeFileSync(file_path, newContent, 'utf-8')
    return `Edited ${file_path}: replaced ${replacementCount} occurrence${replacementCount > 1 ? 's' : ''}.`
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}
