// ── Project types ────────────────────────────────────────────────────

export interface ProjectContext {
  summary: string // auto-maintained by agent after each session
  files: string[] // relevant file paths on server
  notes: string // freeform notes
  stack?: string[] // detected tech stack (for code projects)
}

export interface ProjectStats {
  sessionCount: number
  activeAgents: number
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

  // Default project — auto-created, cannot be deleted
  isDefault?: boolean
}

// ── Agent types ──────────────────────────────────────────────────────
//
// An agent is a conversation with metadata. It lives as agent.json
// alongside meta.json and messages.jsonl in the conversation directory.

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error'

/** A single agent run record for debug visibility */
export interface AgentRunRecord {
  startedAt: number
  completedAt: number | null
  status: 'success' | 'error' | 'timeout'
  error?: string
  durationMs?: number
  trigger: 'cron' | 'manual'
  /** Session ID of the ephemeral run conversation (for viewing run logs) */
  runSessionId?: string
}

/** Agent metadata — stored as agent.json in the conversation directory */
export interface AgentMetadata {
  /** Agent display name */
  name: string
  /** Short description of what the agent does */
  description: string
  /** The prompt/instructions the agent executes on each run */
  instructions: string
  /** If this agent was created from a workflow, the workflow ID */
  workflowId?: string
  /** Cron schedule — null means manual-only */
  schedule?: { cron: string }
  /** Which conversation created this agent (for result delivery) */
  originConversationId?: string
  /** Token budget controls */
  tokenBudget?: {
    perRun: number // max tokens per run (0 = unlimited)
    monthly: number // max tokens per month (0 = unlimited)
    usedThisMonth: number
  }
  /** Current status */
  status: AgentStatus
  /** Timestamp of last run completion */
  lastRunAt: number | null
  /** Timestamp of next scheduled run */
  nextRunAt: number | null
  /** Total number of completed runs */
  runCount: number
  createdAt: number
  /** Recent run history for debug visibility (last 20 runs) */
  runHistory?: AgentRunRecord[]
}

/** Agent session = conversation metadata + agent config */
export interface AgentSession {
  /** The conversation's session ID */
  sessionId: string
  /** Project this agent belongs to */
  projectId: string
  /** Agent metadata from agent.json */
  agent: AgentMetadata
  /** Conversation title (from meta.json) */
  title?: string
  /** Last active timestamp (from meta.json) */
  lastActiveAt?: number
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
  agentSessionId?: string
  severity: NotificationSeverity
  title: string
  body: string
  actions?: NotificationAction[]
  read: boolean
  createdAt: number
}
