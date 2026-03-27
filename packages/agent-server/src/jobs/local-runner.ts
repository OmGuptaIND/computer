/**
 * LocalJobRunner — spawns child processes on the local machine.
 *
 * Uses the same pattern as shell.ts: spawn user's shell with -l -c flags.
 * Streams stdout/stderr as merged line output via readline.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { JobRunHandle, JobRunner, JobRunnerOptions } from './runner.js'

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

export class LocalJobRunner implements JobRunner {
  readonly name = 'local'

  async isAvailable(): Promise<boolean> {
    return true // always available on the local machine
  }

  start(options: JobRunnerOptions): JobRunHandle {
    const runId = generateRunId()
    const userShell = process.env.SHELL || '/bin/sh'

    // Build the full command string
    const fullCommand =
      options.args.length > 0 ? `${options.command} ${options.args.join(' ')}` : options.command

    const child = spawn(userShell, ['-l', '-c', fullCommand], {
      cwd: options.workingDirectory,
      env: {
        ...process.env,
        ...options.env,
        // Ensure common tool paths are available
        PATH: [process.env.PATH, '/usr/local/bin', '/opt/homebrew/bin', '/opt/homebrew/sbin']
          .filter(Boolean)
          .join(':'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Merge stdout and stderr into a single async iterable of lines
    const lineQueue: string[] = []
    let done = false
    let resolveWait: (() => void) | null = null

    const pushLine = (line: string) => {
      lineQueue.push(line)
      if (resolveWait) {
        resolveWait()
        resolveWait = null
      }
    }

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout })
      rl.on('line', (line) => pushLine(line))
    }
    if (child.stderr) {
      const rl = createInterface({ input: child.stderr })
      rl.on('line', (line) => pushLine(`[stderr] ${line}`))
    }

    // Result promise
    const result = new Promise<{ exitCode: number | null; error?: string }>((resolve) => {
      child.on('close', (code, signal) => {
        done = true
        if (resolveWait) {
          resolveWait()
          resolveWait = null
        }
        if (signal) {
          resolve({ exitCode: null, error: `Killed by signal: ${signal}` })
        } else {
          resolve({ exitCode: code })
        }
      })

      child.on('error', (err) => {
        done = true
        if (resolveWait) {
          resolveWait()
          resolveWait = null
        }
        resolve({ exitCode: null, error: err.message })
      })
    })

    // Timeout handling
    let timeoutTimer: NodeJS.Timeout | null = null
    if (options.timeout && options.timeout > 0) {
      timeoutTimer = setTimeout(() => {
        kill()
      }, options.timeout)

      // Clear timeout when process exits naturally
      result.then(() => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
      })
    }

    // Kill function with graceful shutdown
    let killed = false
    const kill = () => {
      if (killed || !child.pid) return
      killed = true

      // Try SIGTERM first
      child.kill('SIGTERM')

      // Force SIGKILL after 5 seconds
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // Process already exited
        }
      }, 5_000)
    }

    // Async iterable for output lines
    const output: AsyncIterable<string> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            while (true) {
              if (lineQueue.length > 0) {
                return { value: lineQueue.shift()!, done: false }
              }
              if (done) {
                return { value: '', done: true }
              }
              // Wait for new data
              await new Promise<void>((resolve) => {
                resolveWait = resolve
              })
            }
          },
        }
      },
    }

    return {
      runId,
      output,
      result,
      kill,
      pid: child.pid,
    }
  }
}
