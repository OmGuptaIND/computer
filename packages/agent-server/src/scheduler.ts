/**
 * Skill scheduler — runs skills on cron schedules.
 * This is what makes the agent a 24/7 worker, not just an on-demand chatbot.
 *
 * Each skill gets its own Session (pi SDK agent instance) so skills
 * don't pollute each other's context.
 */

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig, SkillConfig } from '@anton/agent-config'
import { createLogger } from '@anton/logger'

const log = createLogger('scheduler')
import { getAntonDir } from '@anton/agent-config'
import { buildSkillPrompt } from '@anton/agent-config'
import { type Session, createSession, resumeSession } from '@anton/agent-core'
import { getNextCronTime } from './agents/cron.js'

export interface SchedulerJobInfo {
  name: string
  description: string
  schedule: string
  nextRun: number // timestamp
  lastRun: number | null // timestamp
  enabled: boolean
}

interface ScheduledJob {
  skill: SkillConfig
  cron: string
  nextRun: Date
  lastRun: Date | null
  sessionId: string
  enabled: boolean
}

export type SchedulerEventCallback = (
  skillName: string,
  event: 'started' | 'completed' | 'error',
  detail?: string,
) => void

export class Scheduler {
  private jobs: ScheduledJob[] = []
  private config: AgentConfig
  private sessions: Map<string, Session> = new Map()
  private running = false
  private timer: NodeJS.Timeout | null = null
  private onEvent: SchedulerEventCallback | null = null

  constructor(config: AgentConfig) {
    this.config = config
  }

  /** Set a callback to receive skill run events. */
  setEventCallback(cb: SchedulerEventCallback) {
    this.onEvent = cb
  }

  /**
   * Register skills that have cron schedules.
   */
  addSkills(skills: SkillConfig[]) {
    for (const skill of skills) {
      if (!skill.schedule) continue

      const nextRun = getNextCronTime(skill.schedule)
      if (!nextRun) {
        log.warn({ skill: skill.name, schedule: skill.schedule }, 'invalid schedule')
        continue
      }

      const sessionId = `skill-${skill.name.toLowerCase().replace(/\s+/g, '-')}`

      this.jobs.push({
        skill,
        cron: skill.schedule,
        nextRun,
        lastRun: null,
        sessionId,
        enabled: true,
      })

      log.info(
        { skill: skill.name, cron: skill.schedule, nextRun: nextRun.toISOString() },
        'scheduled',
      )
    }
  }

  /** Return info about all registered jobs. */
  listJobs(): SchedulerJobInfo[] {
    return this.jobs.map((job) => ({
      name: job.skill.name,
      description: job.skill.description ?? '',
      schedule: job.cron,
      nextRun: job.nextRun.getTime(),
      lastRun: job.lastRun ? job.lastRun.getTime() : null,
      enabled: job.enabled,
    }))
  }

  /** Remove a job by skill name. Returns true if found and removed. */
  removeJob(name: string): boolean {
    const idx = this.jobs.findIndex((j) => j.skill.name === name)
    if (idx === -1) return false
    this.jobs.splice(idx, 1)
    return true
  }

  /** Find a job by skill name. */
  findJob(name: string): ScheduledJob | undefined {
    return this.jobs.find((j) => j.skill.name === name)
  }

  start() {
    if (this.jobs.length === 0) return

    this.running = true
    log.info({ jobCount: this.jobs.length }, 'scheduler started')

    this.tick()
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
  }

  private tick() {
    if (!this.running) return

    const now = Date.now()

    for (const job of this.jobs) {
      if (!job.enabled) continue

      if (now >= job.nextRun.getTime()) {
        this.runJob(job).catch((err) => {
          log.error({ skill: job.skill.name, err }, 'job execution error')
          this.onEvent?.(job.skill.name, 'error', (err as Error).message)
        })

        // Compute next run from now
        const next = getNextCronTime(job.cron, new Date())
        if (next) {
          job.nextRun = next
        } else {
          // Could not find next run — disable
          job.enabled = false
          log.warn({ skill: job.skill.name }, 'no future run found, disabling')
        }
      }
    }

    this.timer = setTimeout(() => this.tick(), 30_000)
  }

  private getOrCreateSession(job: ScheduledJob): Session {
    let session = this.sessions.get(job.sessionId)
    if (session) return session

    // Try to resume from disk
    session = resumeSession(job.sessionId, this.config) ?? undefined
    if (!session) {
      session = createSession(job.sessionId, this.config)
    }

    this.sessions.set(job.sessionId, session)
    return session
  }

  async runJob(job: ScheduledJob) {
    const logFile = join(getAntonDir(), 'scheduler.log')
    const timestamp = new Date().toISOString()

    appendFileSync(logFile, `\n[${timestamp}] Running skill: ${job.skill.name}\n`)
    log.info({ skill: job.skill.name }, 'running job')

    this.onEvent?.(job.skill.name, 'started')
    job.lastRun = new Date()

    const session = this.getOrCreateSession(job)
    const prompt = buildSkillPrompt(job.skill)

    for await (const event of session.processMessage(prompt)) {
      if (event.type === 'text') {
        appendFileSync(logFile, `  ${event.content}\n`)
      } else if (event.type === 'tool_call') {
        appendFileSync(logFile, `  [tool] ${event.name}: ${JSON.stringify(event.input)}\n`)
      } else if (event.type === 'error') {
        appendFileSync(logFile, `  [ERROR] ${event.message}\n`)
      }
    }

    appendFileSync(logFile, `[${new Date().toISOString()}] Completed: ${job.skill.name}\n`)
    this.onEvent?.(job.skill.name, 'completed')
  }
}
