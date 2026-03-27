import type { Job } from '@anton/protocol'
import { Bot, Circle, Clock, History, MoreHorizontal, Play, Square, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { connection } from '../../lib/connection.js'
import { useStore } from '../../lib/store.js'

// ── Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--text-tertiary)',
  running: 'var(--accent)',
  paused: 'var(--text-secondary)',
  error: 'var(--red)',
  completed: 'var(--green)',
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'var(--text-tertiary)'
  return (
    <Circle
      size={8}
      fill={color}
      stroke="none"
      className={status === 'running' ? 'pulse-dot' : ''}
    />
  )
}

function formatTokens(n: number): string {
  if (n === 0) return '0'
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron

  const [min, hour, dom, , dow] = parts

  // Common patterns
  if (dom === '*' && dow === '*') {
    if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`
    if (hour === '*') return `Every hour at :${min.padStart(2, '0')}`
    return `Daily at ${hour}:${min.padStart(2, '0')}`
  }
  if (dow === '1-5') return `Weekdays at ${hour}:${min.padStart(2, '0')}`
  if (dow === '1') return `Mondays at ${hour}:${min.padStart(2, '0')}`
  return cron
}

// ── Agent Card ───────────────────────────────────────────────────────

function AgentCard({
  agent,
  projectId,
  onViewHistory,
}: { agent: Job; projectId: string; onViewHistory: (id: string) => void }) {
  const isRunning = agent.status === 'running'
  const [showMenu, setShowMenu] = useState(false)

  const budgetPct =
    agent.tokenBudgetMonthly > 0
      ? Math.min(100, (agent.tokensUsedThisMonth / agent.tokenBudgetMonthly) * 100)
      : 0

  return (
    <div className={`agent-card${isRunning ? ' agent-card--running' : ''}`}>
      {/* Header */}
      <div className="agent-card__header">
        <StatusDot status={agent.status} />
        <span className="agent-card__name">{agent.name}</span>
        <span className="agent-card__kind">{agent.kind}</span>
        <div className="agent-card__menu-wrap">
          <button
            type="button"
            className="agent-card__menu-btn"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreHorizontal size={14} strokeWidth={1.5} />
          </button>
          {showMenu && (
            <>
              <div
                className="agent-card__menu-backdrop"
                onClick={() => setShowMenu(false)}
                onKeyDown={(e) => e.key === 'Escape' && setShowMenu(false)}
              />
              <div className="agent-card__menu">
                <button
                  type="button"
                  className="agent-card__menu-item agent-card__menu-item--danger"
                  onClick={() => {
                    setShowMenu(false)
                    connection.sendAgentAction(projectId, agent.id, 'delete')
                  }}
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                  Delete agent
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {agent.description && <p className="agent-card__desc">{agent.description}</p>}

      {/* Schedule */}
      {agent.trigger.type === 'cron' && (
        <div className="agent-card__meta">
          <Clock size={11} strokeWidth={1.5} />
          <span>{cronToHuman(agent.trigger.schedule)}</span>
        </div>
      )}

      {/* Token usage */}
      {agent.kind === 'agent' && (
        <div className="agent-card__tokens">
          <div className="agent-card__token-row">
            <span className="agent-card__token-label">Last run</span>
            <span className="agent-card__token-value">
              {formatTokens(agent.tokensUsedLastRun)} tokens
            </span>
          </div>
          {agent.tokenBudgetMonthly > 0 && (
            <>
              <div className="agent-card__token-row">
                <span className="agent-card__token-label">Monthly</span>
                <span className="agent-card__token-value">
                  {formatTokens(agent.tokensUsedThisMonth)} /{' '}
                  {formatTokens(agent.tokenBudgetMonthly)}
                </span>
              </div>
              <div className="agent-card__token-bar">
                <div
                  className="agent-card__token-bar-fill"
                  style={{
                    width: `${budgetPct}%`,
                    backgroundColor: budgetPct > 80 ? 'var(--red)' : 'var(--accent)',
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Last run info */}
      {agent.lastRun && (
        <div className="agent-card__last-run">
          {agent.lastRun.status === 'success' ? '✅' : '❌'}{' '}
          {formatRelativeTime(agent.lastRun.startedAt)}
          {agent.lastRun.status === 'error' && agent.lastRun.exitCode !== null && (
            <span className="agent-card__error"> · exit {agent.lastRun.exitCode}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="agent-card__actions">
        {isRunning ? (
          <button
            type="button"
            className="agent-card__action-btn"
            onClick={() => connection.sendAgentAction(projectId, agent.id, 'stop')}
          >
            <Square size={12} strokeWidth={1.5} />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="agent-card__action-btn agent-card__action-btn--primary"
            onClick={() => connection.sendAgentAction(projectId, agent.id, 'start')}
          >
            <Play size={12} strokeWidth={1.5} />
            Run now
          </button>
        )}
        {agent.runCount > 0 && (
          <button
            type="button"
            className="agent-card__action-btn"
            onClick={() => onViewHistory(agent.id)}
          >
            <History size={12} strokeWidth={1.5} />
            History
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────

interface Props {
  projectId: string
}

export function ProjectAgents({ projectId }: Props) {
  const agents = useStore((s) => s.projectAgents)
  const [viewingHistoryFor, setViewingHistoryFor] = useState<string | null>(null)

  useEffect(() => {
    connection.sendAgentsList(projectId)
  }, [projectId])

  // TODO: Agent run history panel (viewingHistoryFor)
  // For now, show logs as a simple fallback
  if (viewingHistoryFor) {
    const agent = agents.find((a) => a.id === viewingHistoryFor)
    return (
      <AgentRunHistory
        agentId={viewingHistoryFor}
        agentName={agent?.name || ''}
        projectId={projectId}
        onBack={() => setViewingHistoryFor(null)}
      />
    )
  }

  return (
    <div className="project-agents">
      {agents.length > 0 ? (
        <div className="project-agents__list">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              projectId={projectId}
              onViewHistory={setViewingHistoryFor}
            />
          ))}
        </div>
      ) : (
        <p className="config-section__hint">
          No agents yet. Ask Anton to create one, e.g. &quot;Create an agent that checks Reddit
          every morning for the best quotes.&quot;
        </p>
      )}
    </div>
  )
}

// ── Run History (inline) ─────────────────────────────────────────────

function AgentRunHistory({
  agentId,
  agentName,
  projectId,
  onBack,
}: { agentId: string; agentName: string; projectId: string; onBack: () => void }) {
  const agentLogs = useStore((s) => s.agentLogs)

  useEffect(() => {
    connection.sendAgentLogs(projectId, agentId, 200)
  }, [projectId, agentId])

  return (
    <div className="agent-history">
      <button type="button" className="agent-history__back" onClick={onBack}>
        ← Back
      </button>
      <div className="agent-history__header">
        <Bot size={14} strokeWidth={1.5} />
        <span>{agentName}</span>
      </div>
      <div className="agent-history__logs">
        {agentLogs.length > 0 ? (
          <pre className="agent-history__pre">{agentLogs.join('\n')}</pre>
        ) : (
          <p className="agent-history__empty">No run history yet.</p>
        )}
      </div>
    </div>
  )
}
