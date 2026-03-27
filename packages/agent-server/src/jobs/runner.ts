/**
 * JobRunner — abstraction for how a job physically runs.
 *
 * LocalJobRunner spawns child processes. Future runners (Modal, Daytona)
 * implement the same interface for remote execution.
 */

export interface JobRunHandle {
  /** Unique ID for this run */
  runId: string
  /** Stream of combined stdout/stderr lines */
  output: AsyncIterable<string>
  /** Resolves when the process exits. Null exitCode means killed/unknown. */
  result: Promise<{ exitCode: number | null; error?: string }>
  /** Kill the running process */
  kill(): void
  /** PID or runner-specific identifier */
  pid?: number
}

export interface JobRunnerOptions {
  command: string
  args: string[]
  workingDirectory: string
  env?: Record<string, string>
  timeout?: number // ms, 0 = no timeout
}

export interface JobRunner {
  readonly name: string // 'local' | 'modal' | 'daytona'
  start(options: JobRunnerOptions): JobRunHandle
  isAvailable(): Promise<boolean>
}
