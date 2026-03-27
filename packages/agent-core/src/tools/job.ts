/**
 * Job management tool — lets the agent create, start, stop, and monitor jobs.
 *
 * Uses a callback pattern (like onTasksUpdate) to bridge agent-core → agent-server.
 * The server provides the actual JobManager implementation via the callback.
 */

export interface JobToolInput {
  operation: 'create' | 'list' | 'start' | 'stop' | 'delete' | 'logs' | 'status'
  // Create params
  name?: string
  description?: string
  kind?: 'task' | 'long-running' | 'agent'
  command?: string
  prompt?: string // agent prompt (for kind: 'agent')
  args?: string[]
  schedule?: string // cron expression
  workingDirectory?: string
  env?: Record<string, string>
  timeout?: number
  restartPolicy?: 'never' | 'on-failure' | 'always'
  maxRestarts?: number
  // Action params
  jobId?: string
  // Logs params
  tail?: number // default 50
}

export type JobActionHandler = (projectId: string, input: JobToolInput) => Promise<string>

export function executeJob(
  projectId: string,
  input: JobToolInput,
  handler: JobActionHandler,
): Promise<string> {
  return handler(projectId, input)
}
