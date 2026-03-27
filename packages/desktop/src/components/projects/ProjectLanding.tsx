import type { Job } from '@anton/protocol'
import type { Project } from '@anton/protocol'
import { motion } from 'framer-motion'
import { Bot, Circle, Clock, History, ListChecks, Play, Plus, Send, Square, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { connection } from '../../lib/connection.js'
import type { SessionMeta } from '../../lib/store.js'
import { useStore } from '../../lib/store.js'
import { Skeleton } from '../Skeleton.js'
import { ConnectorPill, ConnectorBanner } from '../chat/ConnectorToolbar.js'
import { ModelSelector } from '../chat/ModelSelector.js'
import { ProjectConfigPanel } from './ProjectConfigPanel.js'
import { SessionCard } from './SessionCard.js'

interface Props {
  project: Project
  sessions: SessionMeta[]
  sessionsLoading: boolean
  onNewSession: (message?: string) => void
  onOpenSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onBack: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n === 0) return '—'
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, , , dow] = parts
  if (min.startsWith('*/')) return `Every ${min.slice(2)}m`
  if (hour === '*') return `Hourly at :${min.padStart(2, '0')}`
  if (dow === '1-5') return `Weekdays ${hour}:${min.padStart(2, '0')}`
  return `Daily ${hour}:${min.padStart(2, '0')}`
}

// ── Agent Session Card ───────────────────────────────────────────────

function AgentSessionCard({ agent, projectId }: { agent: Job; projectId: string }) {
  const isRunning = agent.status === 'running'

  return (
    <div className={`agent-session-card${isRunning ? ' agent-session-card--running' : ''}`}>
      <div className="agent-session-card__header">
        <Circle
          size={8}
          fill={
            isRunning
              ? 'var(--accent)'
              : agent.status === 'error'
                ? 'var(--red)'
                : 'var(--text-tertiary)'
          }
          stroke="none"
          className={isRunning ? 'pulse-dot' : ''}
        />
        <Bot size={14} strokeWidth={1.5} className="agent-session-card__icon" />
        <span className="agent-session-card__name">{agent.name}</span>
      </div>

      {agent.description && <p className="agent-session-card__desc">{agent.description}</p>}

      {/* Metadata row: schedule, tokens, last run */}
      <div className="agent-session-card__meta">
        {agent.trigger.type === 'cron' && (
          <span className="agent-session-card__pill" title={`Schedule: ${agent.trigger.schedule}`}>
            <Clock size={10} strokeWidth={1.5} />
            {cronToHuman(agent.trigger.schedule)}
          </span>
        )}
        {agent.tokensUsedLastRun > 0 && (
          <span className="agent-session-card__pill" title="Tokens used last run">
            {formatTokens(agent.tokensUsedLastRun)} tok
          </span>
        )}
        {agent.lastRun && (
          <span className="agent-session-card__pill" title={`Last run: ${agent.lastRun.status}`}>
            {agent.lastRun.status === 'success' ? '✓' : '✗'}{' '}
            {formatRelativeTime(agent.lastRun.startedAt)}
          </span>
        )}
        {agent.runCount > 0 && (
          <span className="agent-session-card__pill" title="Total runs">
            <History size={10} strokeWidth={1.5} />
            {agent.runCount}
          </span>
        )}
      </div>

      {/* Token budget bar */}
      {agent.tokenBudgetMonthly > 0 && (
        <div className="agent-session-card__budget">
          <div className="agent-session-card__budget-bar">
            <div
              className="agent-session-card__budget-fill"
              style={{
                width: `${Math.min(100, (agent.tokensUsedThisMonth / agent.tokenBudgetMonthly) * 100)}%`,
              }}
            />
          </div>
          <span className="agent-session-card__budget-label">
            {formatTokens(agent.tokensUsedThisMonth)} / {formatTokens(agent.tokenBudgetMonthly)}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="agent-session-card__actions">
        {isRunning ? (
          <button
            type="button"
            className="agent-session-card__btn"
            onClick={() => connection.sendAgentAction(projectId, agent.id, 'stop')}
          >
            <Square size={11} strokeWidth={1.5} /> Stop
          </button>
        ) : (
          <button
            type="button"
            className="agent-session-card__btn agent-session-card__btn--primary"
            onClick={() => connection.sendAgentAction(projectId, agent.id, 'start')}
          >
            <Play size={11} strokeWidth={1.5} /> Run
          </button>
        )}
        <button
          type="button"
          className="agent-session-card__btn agent-session-card__btn--danger"
          onClick={() => connection.sendAgentAction(projectId, agent.id, 'delete')}
        >
          <Trash2 size={11} strokeWidth={1.5} /> Delete
        </button>
      </div>
    </div>
  )
}

// ── Tabbed Sessions + Agents ─────────────────────────────────────────

function SessionsAndAgents({
  sessions,
  sessionsLoading,
  projectId,
  onOpenSession,
  onDeleteSession,
}: {
  sessions: SessionMeta[]
  sessionsLoading: boolean
  projectId: string
  onOpenSession: (id: string) => void
  onDeleteSession: (id: string) => void
}) {
  const [tab, setTab] = useState<'sessions' | 'agents'>('sessions')
  const agents = useStore((s) => s.projectAgents)

  const agentCount = agents.length
  const runningCount = agents.filter((a) => a.status === 'running').length

  return (
    <div className="project-landing__sessions">
      {/* Tab bar */}
      <div className="project-landing__tab-bar">
        <button
          type="button"
          className={`project-landing__tab${tab === 'sessions' ? ' project-landing__tab--active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          Sessions
          {sessions.length > 0 && (
            <span className="project-landing__tab-count">{sessions.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`project-landing__tab${tab === 'agents' ? ' project-landing__tab--active' : ''}`}
          onClick={() => setTab('agents')}
        >
          <Bot size={13} strokeWidth={1.5} />
          Agents
          {agentCount > 0 && (
            <span
              className={`project-landing__tab-count${runningCount > 0 ? ' project-landing__tab-count--active' : ''}`}
            >
              {runningCount > 0 ? `${runningCount} running` : agentCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'sessions' ? (
        <>
          {sessionsLoading ? (
            <div className="project-landing__sessions-skeleton">
              {[
                { id: 'skel-1', w: '60%' },
                { id: 'skel-2', w: '70%' },
                { id: 'skel-3', w: '80%' },
              ].map((skel) => (
                <div key={skel.id} className="session-card session-card--skeleton">
                  <div className="session-card__content">
                    <Skeleton width={skel.w} height={14} />
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                      <Skeleton width={40} height={12} />
                      <Skeleton width={50} height={12} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length > 0 ? (
            <div className="project-landing__sessions-list">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  sessionId={session.id}
                  title={session.title}
                  messageCount={session.messageCount}
                  lastActiveAt={session.lastActiveAt}
                  onClick={() => onOpenSession(session.id)}
                  onDelete={() => onDeleteSession(session.id)}
                />
              ))}
            </div>
          ) : (
            <div className="project-landing__sessions-empty">
              <Plus size={16} strokeWidth={1.5} />
              <span>Create a new session to get started</span>
            </div>
          )}
        </>
      ) : (
        <>
          {agents.length > 0 ? (
            <div className="project-landing__agents-list">
              {agents.map((agent) => (
                <AgentSessionCard key={agent.id} agent={agent} projectId={projectId} />
              ))}
            </div>
          ) : (
            <div className="project-landing__sessions-empty">
              <Bot size={16} strokeWidth={1.5} />
              <span>Ask Anton to create an agent for you</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400_000) return 'Updated today'
  if (diff < 604800_000) return `Updated ${Math.floor(diff / 86400_000)}d ago`
  return `Updated ${d.toLocaleDateString()}`
}

export function ProjectLanding({
  project,
  sessions,
  sessionsLoading,
  onNewSession,
  onOpenSession,
  onDeleteSession,
  onBack,
}: Props) {
  const [inputValue, setInputValue] = useState('')
  const [planFirst, setPlanFirst] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const raw = inputValue.trim()
    const msg = planFirst && raw ? `[plan first] ${raw}` : raw
    if (msg) {
      onNewSession(msg)
      setInputValue('')
    } else {
      onNewSession()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="project-landing">
      {/* Main content area */}
      <div className="project-landing__main">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="project-landing__content"
        >
          {/* Project header */}
          <div className="project-landing__header">
            <button type="button" className="project-landing__back" onClick={onBack}>
              &larr; Projects
            </button>
            <div className="project-landing__title-row">
              <div className="project-landing__icon" style={{ backgroundColor: project.color }}>
                {project.icon}
              </div>
              <div className="project-landing__info">
                <h1 className="project-landing__name">{project.name}</h1>
                <span className="project-landing__meta">
                  {project.description && `${project.description} · `}
                  {formatDate(project.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Chat input — Manus-style */}
          <div className="project-landing__input-wrap">
            <textarea
              ref={inputRef}
              className="project-landing__input"
              placeholder="Tasks are independent for focus. Use project instructions and files for shared context."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className="project-landing__input-toolbar">
              <div className="project-landing__input-toolbar-left">
                <button
                  type="button"
                  className="project-landing__toolbar-btn"
                  aria-label="Add attachment"
                >
                  <Plus size={18} strokeWidth={1.5} />
                </button>
                <ConnectorPill />
                <button
                  type="button"
                  className={`project-landing__toolbar-btn${planFirst ? ' project-landing__toolbar-btn--active' : ''}`}
                  onClick={() => setPlanFirst(!planFirst)}
                  aria-label="Plan first"
                  title={planFirst ? 'Plan mode on' : 'Plan first'}
                >
                  <ListChecks size={18} strokeWidth={1.5} />
                </button>
              </div>
              <div className="project-landing__input-toolbar-right">
                <ModelSelector />
                <button
                  type="button"
                  className="project-landing__send-btn"
                  onClick={handleSubmit}
                  aria-label="Start session"
                >
                  <Send size={18} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
          <ConnectorBanner />

          {/* Sessions / Agents tabs */}
          <SessionsAndAgents
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            projectId={project.id}
            onOpenSession={onOpenSession}
            onDeleteSession={onDeleteSession}
          />
        </motion.div>
      </div>

      {/* Right config panel */}
      <div className="project-landing__config">
        <ProjectConfigPanel project={project} loading={sessionsLoading} />
      </div>
    </div>
  )
}
