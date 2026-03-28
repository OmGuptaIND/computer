/**
 * AgentManager — manages agents as conversations with metadata.
 *
 * An agent is just a conversation directory with an agent.json sidecar.
 * Running an agent = sending a message to its conversation.
 * Scheduling = cron check every 30s, same as before.
 *
 * This replaces the 689-line JobManager with ~200 lines.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  getProjectSessionsDir,
  listProjectAgents,
  saveAgentMetadata,
  deleteAgentSession,
} from '@anton/agent-config'
import type { AgentMetadata, AgentSession } from '@anton/protocol'
import { getNextCronTime, isValidCron } from './cron.js'

function generateSessionId(projectId: string): string {
  const suffix = `${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  // Use -- as delimiter between prefix, projectId, and suffix
  // This avoids regex ambiguity since projectId may contain underscores
  return `agent--${projectId}--${suffix}`
}

/**
 * Callback to send a message through the server's normal chat path.
 * An agent run = "send the instructions as a message to the conversation."
 */
export type SendMessageHandler = (sessionId: string, content: string) => Promise<void>

export type AgentEventCallback = (event: AgentEvent) => void

export interface AgentEvent {
  type: 'agent_updated' | 'agent_deleted'
  agent?: AgentSession
  projectId?: string
  sessionId?: string
}

export class AgentManager {
  private agents: Map<string, AgentSession> = new Map() // sessionId → AgentSession
  private running = false
  private timer: NodeJS.Timeout | null = null
  private sendMessage: SendMessageHandler | null = null
  private onEvent: AgentEventCallback

  constructor(onEvent: AgentEventCallback) {
    this.onEvent = onEvent
  }

  setSendMessageHandler(handler: SendMessageHandler): void {
    this.sendMessage = handler
  }

  // ── Loading ──────────────────────────────────────────────────────

  /** Load all agents from all projects on startup */
  loadAll(projectIds: string[]): void {
    for (const projectId of projectIds) {
      const agents = listProjectAgents(projectId)
      for (const agent of agents) {
        // Reset running state (process gone after restart)
        if (agent.agent.status === 'running') {
          agent.agent.status = 'idle'
          saveAgentMetadata(agent.projectId, agent.sessionId, agent.agent)
        }
        // Recompute nextRunAt for scheduled agents
        if (agent.agent.schedule?.cron && agent.agent.status !== 'paused') {
          const next = getNextCronTime(agent.agent.schedule.cron)
          agent.agent.nextRunAt = next ? next.getTime() : null
        }
        this.agents.set(agent.sessionId, agent)
      }
    }
    if (this.agents.size > 0) {
      console.log(`  Loaded ${this.agents.size} agent(s)`)
    }
  }

  // ── CRUD ─────────────────────────────────────────────────────────

  createAgent(
    projectId: string,
    spec: {
      name: string
      description?: string
      instructions: string
      schedule?: string // cron expression
      originConversationId?: string
    },
  ): AgentSession {
    const sessionId = generateSessionId(projectId)
    const now = Date.now()

    // Validate cron if provided
    if (spec.schedule && !isValidCron(spec.schedule)) {
      throw new Error(`Invalid cron expression: ${spec.schedule}`)
    }

    const agent: AgentMetadata = {
      name: spec.name,
      description: spec.description ?? '',
      instructions: spec.instructions,
      schedule: spec.schedule ? { cron: spec.schedule } : undefined,
      originConversationId: spec.originConversationId,
      tokenBudget: {
        perRun: 100_000, // default 100k
        monthly: 0,       // unlimited
        usedThisMonth: 0,
      },
      status: 'idle',
      lastRunAt: null,
      nextRunAt: spec.schedule
        ? getNextCronTime(spec.schedule)?.getTime() ?? null
        : null,
      runCount: 0,
      createdAt: now,
    }

    // Create conversation directory
    const dir = join(getProjectSessionsDir(projectId), sessionId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    // Save agent.json
    saveAgentMetadata(projectId, sessionId, agent)

    const session: AgentSession = {
      sessionId,
      projectId,
      agent,
      title: spec.name,
      lastActiveAt: now,
    }

    this.agents.set(sessionId, session)
    return session
  }

  deleteAgent(sessionId: string): boolean {
    const agent = this.agents.get(sessionId)
    if (!agent) return false

    // Remove from disk (conversation directory + agent.json)
    deleteAgentSession(agent.projectId, sessionId)
    this.agents.delete(sessionId)
    return true
  }

  getAgent(sessionId: string): AgentSession | undefined {
    return this.agents.get(sessionId)
  }

  listAgents(projectId: string): AgentSession[] {
    return Array.from(this.agents.values()).filter((a) => a.projectId === projectId)
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  async runAgent(sessionId: string): Promise<AgentSession | undefined> {
    const entry = this.agents.get(sessionId)
    if (!entry) return undefined
    if (entry.agent.status === 'running') return entry // already running

    if (!this.sendMessage) {
      console.error(`Agent "${entry.agent.name}": no sendMessage handler set`)
      return undefined
    }

    // Update status
    entry.agent.status = 'running'
    saveAgentMetadata(entry.projectId, sessionId, entry.agent)
    this.emitUpdate(entry)

    try {
      // Send the instructions as a message to the conversation
      await this.sendMessage(sessionId, entry.agent.instructions)

      // Run completed
      entry.agent.status = entry.agent.schedule ? 'idle' : 'idle'
      entry.agent.lastRunAt = Date.now()
      entry.agent.runCount++
    } catch (err) {
      console.error(`Agent "${entry.agent.name}" error:`, err)
      entry.agent.status = 'error'
      entry.agent.lastRunAt = Date.now()
    }

    // Recompute next run
    if (entry.agent.schedule?.cron) {
      const next = getNextCronTime(entry.agent.schedule.cron)
      entry.agent.nextRunAt = next ? next.getTime() : null
    }

    saveAgentMetadata(entry.projectId, sessionId, entry.agent)
    this.emitUpdate(entry)
    return entry
  }

  stopAgent(sessionId: string): AgentSession | undefined {
    const entry = this.agents.get(sessionId)
    if (!entry) return undefined

    entry.agent.status = 'idle'
    saveAgentMetadata(entry.projectId, sessionId, entry.agent)
    this.emitUpdate(entry)
    return entry
  }

  pauseAgent(sessionId: string): AgentSession | undefined {
    const entry = this.agents.get(sessionId)
    if (!entry) return undefined

    entry.agent.status = 'paused'
    entry.agent.nextRunAt = null
    saveAgentMetadata(entry.projectId, sessionId, entry.agent)
    this.emitUpdate(entry)
    return entry
  }

  resumeAgent(sessionId: string): AgentSession | undefined {
    const entry = this.agents.get(sessionId)
    if (!entry) return undefined

    entry.agent.status = 'idle'
    if (entry.agent.schedule?.cron) {
      const next = getNextCronTime(entry.agent.schedule.cron)
      entry.agent.nextRunAt = next ? next.getTime() : null
    }
    saveAgentMetadata(entry.projectId, sessionId, entry.agent)
    this.emitUpdate(entry)
    return entry
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

    for (const entry of this.agents.values()) {
      if (entry.agent.status === 'paused') continue
      if (!entry.agent.schedule?.cron) continue
      if (!entry.agent.nextRunAt || now < entry.agent.nextRunAt) continue
      if (entry.agent.status === 'running') continue // don't double-start

      console.log(`[AgentManager] Cron trigger: ${entry.agent.name}`)
      this.runAgent(entry.sessionId)

      // Compute next run
      const next = getNextCronTime(entry.agent.schedule.cron, new Date())
      entry.agent.nextRunAt = next ? next.getTime() : null
      saveAgentMetadata(entry.projectId, entry.sessionId, entry.agent)
    }

    this.timer = setTimeout(() => this.tick(), 30_000)
  }

  // ── Events ───────────────────────────────────────────────────────

  private emitUpdate(entry: AgentSession): void {
    this.onEvent({ type: 'agent_updated', agent: entry })
  }

  // ── Shutdown ─────────────────────────────────────────────────────

  shutdown(): void {
    this.stop()
  }
}
