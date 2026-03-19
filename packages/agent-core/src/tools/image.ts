/**
 * Image tool — screenshots, resize, convert, crop, info.
 * Uses screencapture + sips on macOS, scrot + ImageMagick on Linux.
 */

import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { platform } from 'node:os'

export interface ImageInput {
  operation: 'screenshot' | 'resize' | 'convert' | 'info' | 'crop'
  path?: string
  output?: string
  width?: number
  height?: number
  format?: string
  region?: { x: number; y: number; w: number; h: number }
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15_000 }).trim()
  } catch (err: unknown) {
    const e = err as { stderr?: string; message: string }
    throw new Error(e.stderr?.trim() || e.message)
  }
}

export function executeImage(input: ImageInput): string {
  const os = platform()

  try {
    switch (input.operation) {
      case 'screenshot': {
        const output = input.output || `/tmp/screenshot_${Date.now()}.png`
        if (os === 'darwin') {
          if (input.region) {
            const { x, y, w, h } = input.region
            run(`screencapture -R${x},${y},${w},${h} "${output}"`)
          } else {
            run(`screencapture -x "${output}"`)
          }
        } else {
          if (input.region) {
            const { x, y, w, h } = input.region
            run(`scrot -a ${x},${y},${w},${h} "${output}"`)
          } else {
            run(`scrot "${output}"`)
          }
        }
        return `Screenshot saved to ${output}`
      }

      case 'resize': {
        if (!input.path) return 'Error: path is required for resize.'
        if (!existsSync(input.path)) return `Error: file not found: ${input.path}`
        const output = input.output || input.path
        if (os === 'darwin') {
          const flags: string[] = []
          if (input.width) flags.push(`--resampleWidth ${input.width}`)
          if (input.height) flags.push(`--resampleHeight ${input.height}`)
          if (flags.length === 0) return 'Error: width or height is required for resize.'
          run(`sips ${flags.join(' ')} "${input.path}" --out "${output}"`)
        } else {
          const size = `${input.width || ''}x${input.height || ''}`
          run(`convert "${input.path}" -resize ${size} "${output}"`)
        }
        return `Resized to ${output}`
      }

      case 'convert': {
        if (!input.path) return 'Error: path is required for convert.'
        if (!input.format) return 'Error: format is required for convert.'
        if (!existsSync(input.path)) return `Error: file not found: ${input.path}`
        const ext = input.format.toLowerCase()
        const output = input.output || input.path.replace(/\.[^.]+$/, `.${ext}`)
        if (os === 'darwin') {
          run(`sips -s format ${ext === 'jpg' ? 'jpeg' : ext} "${input.path}" --out "${output}"`)
        } else {
          run(`convert "${input.path}" "${output}"`)
        }
        return `Converted to ${output}`
      }

      case 'info': {
        if (!input.path) return 'Error: path is required for info.'
        if (!existsSync(input.path)) return `Error: file not found: ${input.path}`
        const stat = statSync(input.path)
        if (os === 'darwin') {
          const info = run(`sips -g pixelWidth -g pixelHeight -g format "${input.path}"`)
          return `${info}\nSize: ${(stat.size / 1024).toFixed(1)} KB`
        }
        const info = run(`identify "${input.path}"`)
        return `${info}\nSize: ${(stat.size / 1024).toFixed(1)} KB`
      }

      case 'crop': {
        if (!input.path) return 'Error: path is required for crop.'
        if (!input.region) return 'Error: region is required for crop.'
        if (!existsSync(input.path)) return `Error: file not found: ${input.path}`
        const { x, y, w, h } = input.region
        const output = input.output || input.path
        if (os === 'darwin') {
          run(`sips -c ${h} ${w} --cropOffset ${y} ${x} "${input.path}" --out "${output}"`)
        } else {
          run(`convert "${input.path}" -crop ${w}x${h}+${x}+${y} "${output}"`)
        }
        return `Cropped to ${output}`
      }

      default:
        return `Error: unknown operation "${input.operation}".`
    }
  } catch (err: unknown) {
    return `Error: ${(err as Error).message}`
  }
}
