/**
 * JobManager — CRUD, lifecycle, scheduling, and monitoring for jobs.
 *
 * Manages the full job lifecycle: create, start, stop, restart, schedule.
 * Uses the JobRunner abstraction for process execution (local by default,
 * extensible to Modal/Daytona in the future).
 */

import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig } from '@anton/agent-config'
import { getAntonDir } from '@anton/agent-config'
import { type Session, createSession, resumeSession } from '@anton/agent-core'
import type { McpManager } from '@anton/agent-core'
import type { Job, JobRunRecord, ProjectNotification } from '@anton/protocol'
import type { JobEventMessage, NotificationEventMessage } from '@anton/protocol'
import { getNextCronTime } from './cron.js'
import { LocalJobRunner } from './local-runner.js'
import { appendNotification } from './notifications.js'
import type { JobRunHandle, JobRunner } from './runner.js'

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

function defaultTimeoutForKind(kind: Job['kind']): number {
  switch (kind) {
    case 'task':
      return 300 // 5 min
    case 'agent':
      return 600 // 10 min
    case 'long-running':
      return 0 // intentionally unlimited
  }
}

export type JobManagerEvent = JobEventMessage | NotificationEventMessage

export class JobManager {
  private jobs: Map<string, Job> = new Map()
  private activeRuns: Map<string, JobRunHandle> = new Map()
  private agentSessions: Map<string, Session> = new Map()
  private runners: Map<string, JobRunner> = new Map()
  private running = false
  private timer: NodeJS.Timeout | null = null
  private config: AgentConfig
  private mcpManager: McpManager | null
  private onEvent: (event: JobManagerEvent) => void

  constructor(
    config: AgentConfig,
    mcpManager: McpManager | null,
    onEvent: (event: JobManagerEvent) => void,
  ) {
    this.config = config
    this.mcpManager = mcpManager
    this.onEvent = onEvent

    // Register the local runner by default
    const localRunner = new LocalJobRunner()
    this.runners.set(localRunner.name, localRunner)
  }

  /** Register an additional runner (Modal, Daytona, etc.) */
  registerRunner(runner: JobRunner): void {
    this.runners.set(runner.name, runner)
  }

  // ── Persistence ──────────────────────────────────────────────────

  private getJobDir(projectId: string, jobId: string): string {
    return join(getAntonDir(), 'projects', projectId, 'jobs', jobId)
  }

  private getJobPath(projectId: string, jobId: string): string {
    return join(this.getJobDir(projectId, jobId), 'job.json')
  }

  private getRunsDir(projectId: string, jobId: string): string {
    return join(this.getJobDir(projectId, jobId), 'runs')
  }

  private getRunLogPath(projectId: string, jobId: string, runId: string): string {
    return join(this.getRunsDir(projectId, jobId), `${runId}.log`)
  }

  private persistJob(job: Job): void {
    const dir = this.getJobDir(job.projectId, job.id)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.getJobPath(job.projectId, job.id), JSON.stringify(job, null, 2))
  }

  private persistRunResult(job: Job, runRecord: JobRunRecord): void {
    const runsDir = this.getRunsDir(job.projectId, job.id)
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true })
    const runPath = join(runsDir, `${runRecord.runId}.json`)
    writeFileSync(runPath, JSON.stringify(runRecord, null, 2))
  }

  // ── Loading ──────────────────────────────────────────────────────

  /** Scan all projects and load their jobs on startup. */
  async loadAllJobs(): Promise<void> {
    const projectsDir = join(getAntonDir(), 'projects')
    if (!existsSync(projectsDir)) return

    for (const projectId of readdirSync(projectsDir)) {
      const jobsDir = join(projectsDir, projectId, 'jobs')
      if (!existsSync(jobsDir)) continue

      for (const jobId of readdirSync(jobsDir)) {
        const jobPath = join(jobsDir, jobId, 'job.json')
        if (!existsSync(jobPath)) continue

        try {
          const job: Job = JSON.parse(readFileSync(jobPath, 'utf-8'))
          // Reset running state on load (process is gone after restart)
          if (job.status === 'running') {
            job.status = 'idle'
          }
          // Recompute nextRun for scheduled jobs
          if (job.trigger.type === 'cron' && job.status !== 'paused') {
            const next = getNextCronTime(job.trigger.schedule)
            job.nextRun = next ? next.getTime() : null
          }
          this.jobs.set(job.id, job)
        } catch (err) {
          console.error(`Failed to load job ${jobId}:`, err)
        }
      }
    }

    if (this.jobs.size > 0) {
      console.log(`  Loaded ${this.jobs.size} job(s)`)
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  createJob(
    projectId: string,
    spec: {
      name: string
      description?: string
      kind: Job['kind']
      command?: string
      args?: string[]
      prompt?: string // agent prompt (for kind: 'agent')
      trigger?: Job['trigger']
      workingDirectory?: string
      env?: Record<string, string>
      timeout?: number
      restartPolicy?: Job['restartPolicy']
      maxRestarts?: number
    },
  ): Job {
    const id = generateId('job')
    const now = Date.now()

    const trigger = spec.trigger ?? { type: 'manual' as const }
    let nextRun: number | null = null
    if (trigger.type === 'cron') {
      const next = getNextCronTime(trigger.schedule)
      nextRun = next ? next.getTime() : null
    }

    // Resolve working directory: default to project workspace
    const workingDirectory =
      spec.workingDirectory ?? join(getAntonDir(), 'projects', projectId, 'workspace')

    const job: Job = {
      id,
      projectId,
      name: spec.name,
      description: spec.description ?? '',
      kind: spec.kind,
      status: 'idle',
      trigger,
      command: spec.command ?? '',
      args: spec.args ?? [],
      prompt: spec.prompt,
      workingDirectory,
      env: spec.env ?? {},
      timeout: spec.timeout ?? defaultTimeoutForKind(spec.kind),
      restartPolicy: spec.restartPolicy ?? (spec.kind === 'long-running' ? 'on-failure' : 'never'),
      maxRestarts: spec.maxRestarts ?? 3,
      runner: 'local',
      tokenBudgetPerRun: spec.kind === 'agent' ? 100_000 : 0, // default 100k for agents
      tokenBudgetMonthly: 0, // unlimited by default
      tokensUsedThisMonth: 0,
      tokensUsedLastRun: 0,
      lastRun: null,
      nextRun,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    // Ensure workspace directory exists
    if (!existsSync(workingDirectory)) {
      mkdirSync(workingDirectory, { recursive: true })
    }

    this.jobs.set(id, job)
    this.persistJob(job)

    return job
  }

  deleteJob(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false

    // Stop if running
    if (job.status === 'running') {
      this.stopJob(jobId)
    }

    // Remove files
    const dir = this.getJobDir(job.projectId, job.id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }

    this.jobs.delete(jobId)
    return true
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId)
  }

  listJobs(projectId: string): Job[] {
    return Array.from(this.jobs.values()).filter((j) => j.projectId === projectId)
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  startJob(jobId: string): Job | undefined {
    const job = this.jobs.get(jobId)
    if (!job) return undefined
    if (job.status === 'running') return job // already running

    // Agent jobs run as AI sessions, not shell processes
    if (job.kind === 'agent') {
      return this.startAgentJob(job)
    }

    const runner = this.runners.get(job.runner)
    if (!runner) {
      console.error(`No runner found for "${job.runner}"`)
      return undefined
    }

    const handle = runner.start({
      command: job.command,
      args: job.args,
      workingDirectory: job.workingDirectory ?? process.cwd(),
      env: job.env,
      timeout: job.timeout > 0 ? job.timeout * 1000 : 0,
    })

    this.activeRuns.set(jobId, handle)

    // Update job state
    job.status = 'running'
    job.lastRun = {
      runId: handle.runId,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      status: 'running',
    }
    job.runCount++
    job.updatedAt = Date.now()
    this.persistJob(job)

    // Emit started event
    this.emitJobEvent(job, 'started', handle.runId)

    // Pipe output to log file
    this.pipeOutputToLog(job, handle)

    // Handle process completion
    handle.result.then((result) => {
      this.activeRuns.delete(jobId)

      const runRecord: JobRunRecord = {
        runId: handle.runId,
        startedAt: job.lastRun!.startedAt,
        finishedAt: Date.now(),
        exitCode: result.exitCode,
        status: result.exitCode === 0 ? 'success' : 'error',
      }

      job.lastRun = runRecord
      job.updatedAt = Date.now()
      this.persistRunResult(job, runRecord)

      if (result.exitCode === 0) {
        job.status = 'completed'
        this.emitJobEvent(job, 'completed', handle.runId)
        this.emitNotification(job, 'success', `Job "${job.name}" completed successfully`)
      } else if (result.error) {
        job.status = 'error'
        this.emitJobEvent(job, 'crashed', handle.runId, result.error)
        this.emitNotification(job, 'error', `Job "${job.name}" crashed: ${result.error}`)
        this.handleRestart(job)
      } else {
        job.status = 'error'
        this.emitJobEvent(job, 'failed', handle.runId, `Exit code: ${result.exitCode}`)
        this.emitNotification(
          job,
          'error',
          `Job "${job.name}" failed (exit code ${result.exitCode})`,
        )
        this.handleRestart(job)
      }

      // For task jobs, reset to idle so they can be re-run
      if (job.kind === 'task' && job.status === 'completed') {
        job.status = 'idle'
      }

      this.persistJob(job)
    })

    return job
  }

  stopJob(jobId: string): Job | undefined {
    const job = this.jobs.get(jobId)
    if (!job) return undefined

    // Stop shell jobs
    const handle = this.activeRuns.get(jobId)
    if (handle) {
      handle.kill()
      this.activeRuns.delete(jobId)
    }

    // Stop agent jobs
    const agentSession = this.agentSessions.get(jobId)
    if (agentSession) {
      agentSession.cancel()
      this.agentSessions.delete(jobId)
    }

    job.status = 'idle'
    job.updatedAt = Date.now()

    if (job.lastRun && job.lastRun.status === 'running') {
      job.lastRun.finishedAt = Date.now()
      job.lastRun.status = 'error'
    }

    this.persistJob(job)
    this.emitJobEvent(job, 'stopped')

    return job
  }

  /** Start an agent job — runs as an AI session with full project + MCP powers */
  private startAgentJob(job: Job): Job | undefined {
    if (!job.prompt) {
      console.error(`Agent job "${job.name}" has no prompt`)
      return undefined
    }

    const runId = generateId('run')
    const sessionId = `agent-job-${job.projectId}-${job.id}`

    // Update job state
    job.status = 'running'
    job.lastRun = {
      runId,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      status: 'running',
    }
    job.runCount++
    job.updatedAt = Date.now()
    this.persistJob(job)
    this.emitJobEvent(job, 'started', runId)

    // Run the agent session asynchronously
    this.runAgentSession(job, sessionId, runId).catch((err) => {
      console.error(`Agent job "${job.name}" error:`, err)
      job.status = 'error'
      job.lastRun = {
        runId,
        startedAt: job.lastRun!.startedAt,
        finishedAt: Date.now(),
        exitCode: null,
        status: 'error',
      }
      job.updatedAt = Date.now()
      this.persistJob(job)
      this.emitJobEvent(job, 'crashed', runId, (err as Error).message)
      this.emitNotification(
        job,
        'error',
        `Agent job "${job.name}" crashed: ${(err as Error).message}`,
      )
    })

    return job
  }

  /** Build a job action callback so agent jobs can create/manage other jobs */
  private buildJobActionCallback(): import('@anton/agent-core').JobActionHandler {
    return async (projectId, input) => {
      switch (input.operation) {
        case 'create': {
          if (!input.name) return 'Error: name is required'
          const trigger = input.schedule
            ? { type: 'cron' as const, schedule: input.schedule }
            : { type: 'manual' as const }
          const job = this.createJob(projectId, {
            name: input.name,
            description: input.description,
            kind: input.kind ?? 'task',
            command: input.command,
            prompt: input.prompt,
            args: input.args,
            trigger,
          })
          return `Job created: ${job.name} (id: ${job.id})`
        }
        case 'list':
          return (
            this.listJobs(projectId)
              .map((j) => `- ${j.name} (${j.id}): ${j.status}`)
              .join('\n') || 'No jobs.'
          )
        case 'start':
          return this.startJob(input.jobId!)
            ? `Job started: ${input.jobId}`
            : `Error: job not found: ${input.jobId}`
        case 'stop':
          return this.stopJob(input.jobId!)
            ? `Job stopped: ${input.jobId}`
            : `Error: job not found: ${input.jobId}`
        case 'logs': {
          const result = this.getJobLogs(input.jobId!, undefined, input.tail ?? 50)
          return result?.lines.join('\n') || 'No logs.'
        }
        case 'status': {
          const j = this.getJob(input.jobId!)
          return j ? `${j.name}: ${j.status} (runs: ${j.runCount})` : 'Job not found.'
        }
        default:
          return `Unknown operation: ${input.operation}`
      }
    }
  }

  private async runAgentSession(job: Job, sessionId: string, runId: string): Promise<void> {
    // Try to resume existing session (for recurring agent jobs that maintain context)
    const maxDurationMs = job.timeout > 0 ? job.timeout * 1000 : undefined

    // Build the onJobAction callback so agent jobs can manage other jobs
    const onJobAction = this.buildJobActionCallback()

    const sessionOpts = {
      projectId: job.projectId,
      projectWorkspacePath: job.workingDirectory,
      mcpManager: this.mcpManager ?? undefined,
      onJobAction,
      maxDurationMs,
      maxTokenBudget: job.tokenBudgetPerRun > 0 ? job.tokenBudgetPerRun : undefined,
    }

    let session: Session | null = resumeSession(sessionId, this.config, sessionOpts)
    if (!session) {
      session = createSession(sessionId, this.config, sessionOpts)
    }

    this.agentSessions.set(job.id, session)

    // Prepare log file
    const runsDir = this.getRunsDir(job.projectId, job.id)
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true })
    const logPath = this.getRunLogPath(job.projectId, job.id, runId)

    appendFileSync(logPath, `[${new Date().toISOString()}] Agent job started: ${job.name}\n`)
    appendFileSync(logPath, `[prompt] ${job.prompt}\n\n`)

    try {
      for await (const event of session.processMessage(job.prompt!)) {
        // Log events
        if (event.type === 'text') {
          appendFileSync(logPath, event.content)
        } else if (event.type === 'tool_call') {
          appendFileSync(logPath, `\n[tool] ${event.name}: ${JSON.stringify(event.input)}\n`)
        } else if (event.type === 'tool_result') {
          const preview =
            event.output.length > 500 ? `${event.output.slice(0, 500)}...` : event.output
          appendFileSync(logPath, `[result] ${preview}\n`)
        } else if (event.type === 'error') {
          appendFileSync(logPath, `\n[ERROR] ${event.message}\n`)
        }
      }

      appendFileSync(logPath, `\n[${new Date().toISOString()}] Agent job completed: ${job.name}\n`)

      const runRecord: JobRunRecord = {
        runId,
        startedAt: job.lastRun!.startedAt,
        finishedAt: Date.now(),
        exitCode: 0,
        status: 'success',
      }
      job.lastRun = runRecord
      job.status = job.kind === 'agent' && job.trigger.type === 'cron' ? 'idle' : 'completed'
      // Track token usage from the session
      const usage = session.getCumulativeUsage()
      job.tokensUsedLastRun = usage.totalTokens
      job.tokensUsedThisMonth += usage.totalTokens
      job.updatedAt = Date.now()
      this.persistJob(job)
      this.persistRunResult(job, runRecord)
      this.emitJobEvent(job, 'completed', runId)
      this.emitNotification(job, 'success', `Agent job "${job.name}" completed successfully`)
    } catch (err) {
      appendFileSync(
        logPath,
        `\n[${new Date().toISOString()}] Agent job failed: ${(err as Error).message}\n`,
      )
      throw err
    } finally {
      this.agentSessions.delete(job.id)
    }
  }

  private restartCounts: Map<string, number> = new Map()

  private handleRestart(job: Job): void {
    if (job.kind !== 'long-running') return
    if (job.restartPolicy === 'never') return
    if (job.restartPolicy === 'on-failure' && job.lastRun?.exitCode === 0) return

    const count = (this.restartCounts.get(job.id) ?? 0) + 1
    this.restartCounts.set(job.id, count)

    if (count > job.maxRestarts) {
      this.emitNotification(
        job,
        'error',
        `Job "${job.name}" stopped after ${job.maxRestarts} restarts`,
      )
      this.restartCounts.delete(job.id)
      return
    }

    console.log(`[JobManager] Restarting "${job.name}" (${count}/${job.maxRestarts})`)
    this.emitNotification(
      job,
      'warning',
      `Job "${job.name}" crashed, restarting (${count}/${job.maxRestarts})`,
    )

    // Small delay before restart
    setTimeout(() => {
      this.startJob(job.id)
    }, 2_000)
  }

  // ── Output & Logs ────────────────────────────────────────────────

  private async pipeOutputToLog(job: Job, handle: JobRunHandle): Promise<void> {
    const runsDir = this.getRunsDir(job.projectId, job.id)
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true })

    const logPath = this.getRunLogPath(job.projectId, job.id, handle.runId)

    try {
      for await (const line of handle.output) {
        appendFileSync(logPath, `${line}\n`)
      }
    } catch {
      // Stream ended (process exited or was killed)
    }
  }

  getJobLogs(
    jobId: string,
    runId?: string,
    tail = 100,
  ): { runId: string; lines: string[] } | undefined {
    const job = this.jobs.get(jobId)
    if (!job) return undefined

    // Use specified runId or the latest run
    const effectiveRunId = runId ?? job.lastRun?.runId
    if (!effectiveRunId) return { runId: '', lines: [] }

    const logPath = this.getRunLogPath(job.projectId, job.id, effectiveRunId)
    if (!existsSync(logPath)) return { runId: effectiveRunId, lines: [] }

    const content = readFileSync(logPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    return {
      runId: effectiveRunId,
      lines: lines.slice(-tail),
    }
  }

  // ── Scheduling ───────────────────────────────────────────────────

  start(): void {
    this.running = true
    this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private tick(): void {
    if (!this.running) return

    const now = Date.now()

    for (const job of this.jobs.values()) {
      if (job.status === 'paused') continue
      if (job.trigger.type !== 'cron') continue
      if (!job.nextRun || now < job.nextRun) continue
      if (job.status === 'running') continue // don't double-start

      // Time to run
      console.log(`[JobManager] Cron trigger: ${job.name}`)
      this.startJob(job.id)

      // Compute next run
      const next = getNextCronTime(job.trigger.schedule, new Date())
      job.nextRun = next ? next.getTime() : null
      job.updatedAt = Date.now()
      this.persistJob(job)
    }

    this.timer = setTimeout(() => this.tick(), 30_000)
  }

  // ── Events & Notifications ───────────────────────────────────────

  private emitJobEvent(
    job: Job,
    event: JobEventMessage['event'],
    runId?: string,
    detail?: string,
  ): void {
    this.onEvent({
      type: 'job_event',
      jobId: job.id,
      projectId: job.projectId,
      jobName: job.name,
      event,
      detail,
      runId,
      timestamp: Date.now(),
    })
  }

  private emitNotification(
    job: Job,
    severity: 'info' | 'success' | 'warning' | 'error',
    body: string,
  ): void {
    const notification: ProjectNotification = {
      id: generateId('notif'),
      projectId: job.projectId,
      jobId: job.id,
      severity,
      title: `Job: ${job.name}`,
      body,
      read: false,
      createdAt: Date.now(),
    }

    // Persist to JSONL
    appendNotification(job.projectId, notification)

    // Push to client
    this.onEvent({
      type: 'notification',
      projectId: job.projectId,
      notification: {
        id: notification.id,
        jobId: notification.jobId,
        severity: notification.severity,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
      },
    })
  }

  // ── Shutdown ─────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stop()

    // Kill all running processes
    for (const [jobId, handle] of this.activeRuns) {
      console.log(`[JobManager] Stopping job: ${jobId}`)
      handle.kill()
    }

    this.activeRuns.clear()
  }
}
