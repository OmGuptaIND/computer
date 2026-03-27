// ── Project types ────────────────────────────────────────────────────

export interface ProjectContext {
  summary: string // auto-maintained by agent after each session
  files: string[] // relevant file paths on server
  notes: string // freeform notes
  stack?: string[] // detected tech stack (for code projects)
}

export interface ProjectStats {
  sessionCount: number
  activeJobs: number
  lastActive: number
}

/** How the project was created */
export type ProjectSource = 'prompt' | 'git-clone' | 'import' | 'manual'

/** Project classification — determines prompt module and UI mode */
export type ProjectType = 'code' | 'document' | 'data' | 'clone' | 'mixed'

export interface Project {
  id: string // e.g. "proj_abc123"
  name: string // "LinkedIn Scraper"
  description: string // "Scrapes VP-level SaaS leads..."
  icon: string // emoji or icon name
  color: string // hex color for UI
  createdAt: number
  updatedAt: number
  context: ProjectContext
  stats: ProjectStats

  // Workspace fields (Phase 1)
  type?: ProjectType // project classification
  workspacePath?: string // absolute path to ~/Anton/{name}/
  source?: ProjectSource // how the project was created
  sourceConversationId?: string // the conversation that triggered creation
}

// ── Job types ────────────────────────────────────────────────────────

export type JobKind = 'task' | 'long-running' | 'agent'

export type JobTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'manual' }
  | { type: 'event'; event: string }

export type JobStatus = 'idle' | 'running' | 'paused' | 'error' | 'completed'

export type RestartPolicy = 'never' | 'on-failure' | 'always'

export interface JobRunRecord {
  runId: string
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  status: 'running' | 'success' | 'error'
}

export interface Job {
  id: string
  projectId: string
  name: string
  description: string
  kind: JobKind
  status: JobStatus
  trigger: JobTrigger

  // Execution (shell jobs use command; agent jobs use prompt)
  command: string
  args: string[]
  prompt?: string // agent prompt (for kind: 'agent')
  workingDirectory?: string
  env: Record<string, string>
  timeout: number // seconds, 0 = no limit

  // Lifecycle (for long-running jobs)
  restartPolicy: RestartPolicy
  maxRestarts: number

  // Runner (extensibility: 'local' | 'modal' | 'daytona')
  runner: string

  // Token budget (for agent jobs)
  tokenBudgetPerRun: number // max tokens per run (0 = unlimited)
  tokenBudgetMonthly: number // max tokens per month (0 = unlimited)
  tokensUsedThisMonth: number // running total, resets monthly
  tokensUsedLastRun: number // tokens consumed in the most recent run

  // Runtime state
  lastRun: JobRunRecord | null
  nextRun: number | null // timestamp for scheduled jobs
  runCount: number

  createdAt: number
  updatedAt: number
}

// ── Notification types ───────────────────────────────────────────────

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface NotificationAction {
  label: string
  action: string
}

export interface ProjectNotification {
  id: string
  projectId: string
  jobId?: string
  severity: NotificationSeverity
  title: string
  body: string
  actions?: NotificationAction[]
  read: boolean
  createdAt: number
}
