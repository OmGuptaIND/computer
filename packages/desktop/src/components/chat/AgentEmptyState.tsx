import type { AgentRunRecord, AgentSession } from '@anton/protocol'
import { motion } from 'framer-motion'
import { AlertCircle, Calendar, CheckCircle2, ChevronDown, ChevronUp, Clock, Hash, Play, Square, Timer, Zap } from 'lucide-react'
import { useState } from 'react'
import { cronToHuman, formatAbsoluteTime, formatDuration, formatRelativeTime } from '../../lib/agent-utils.js'
import { connection } from '../../lib/connection.js'

interface Props {
  agent: AgentSession
}

function RunEntry({ run }: { run: AgentRunRecord }) {
  const [expanded, setExpanded] = useState(false)
  const isErr = run.status === 'error'

  return (
    <div className={`agent-run-entry${isErr ? ' agent-run-entry--error' : ''}`}>
      <button
        type="button"
        className="agent-run-entry__row"
        onClick={() => isErr && run.error && setExpanded(!expanded)}
        disabled={!isErr || !run.error}
      >
        {isErr ? (
          <AlertCircle size={12} strokeWidth={1.5} className="agent-run-entry__icon agent-run-entry__icon--error" />
        ) : (
          <CheckCircle2 size={12} strokeWidth={1.5} className="agent-run-entry__icon agent-run-entry__icon--success" />
        )}
        <span className="agent-run-entry__time">{formatAbsoluteTime(run.startedAt)}</span>
        <span className={`agent-run-entry__trigger agent-run-entry__trigger--${run.trigger}`}>
          {run.trigger}
        </span>
        {run.durationMs != null && (
          <span className="agent-run-entry__duration">{formatDuration(run.durationMs)}</span>
        )}
        {isErr && run.error && (
          <ChevronDown size={10} strokeWidth={1.5} className={`agent-run-entry__expand${expanded ? ' agent-run-entry__expand--open' : ''}`} />
        )}
      </button>
      {expanded && run.error && (
        <div className="agent-run-entry__error">{run.error}</div>
      )}
    </div>
  )
}

export function AgentEmptyState({ agent }: Props) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const meta = agent.agent
  const isRunning = meta.status === 'running'
  const isError = meta.status === 'error'

  const handleRunStop = () => {
    if (isRunning) {
      connection.sendAgentAction(agent.projectId, agent.sessionId, 'stop')
    } else {
      connection.sendAgentAction(agent.projectId, agent.sessionId, 'start')
    }
  }

  return (
    <div className="agent-empty-state">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="agent-empty-state__inner"
      >
        {/* Identity */}
        <div className="agent-empty-state__identity">
          <div className="agent-empty-state__name-row">
            <span
              className={`agent-empty-state__dot${isRunning ? ' agent-empty-state__dot--running' : isError ? ' agent-empty-state__dot--error' : ''}`}
            />
            <h2 className="agent-empty-state__name">{meta.name}</h2>
          </div>
          {meta.description && (
            <p className="agent-empty-state__description">{meta.description}</p>
          )}
          {meta.schedule?.cron && (
            <span className="agent-empty-state__schedule">
              <Calendar size={12} strokeWidth={1.5} />
              {cronToHuman(meta.schedule.cron)}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="agent-empty-state__stats">
          <div className="agent-empty-state__stat">
            <Clock size={14} strokeWidth={1.5} />
            <div className="agent-empty-state__stat-content">
              <span className="agent-empty-state__stat-value">
                {meta.lastRunAt ? formatRelativeTime(meta.lastRunAt) : 'Never'}
              </span>
              <span className="agent-empty-state__stat-label">Last run</span>
            </div>
          </div>
          <div className="agent-empty-state__stat">
            <Calendar size={14} strokeWidth={1.5} />
            <div className="agent-empty-state__stat-content">
              <span className="agent-empty-state__stat-value">
                {meta.nextRunAt ? formatRelativeTime(meta.nextRunAt) : 'Manual'}
              </span>
              <span className="agent-empty-state__stat-label">Next run</span>
            </div>
          </div>
          <div className="agent-empty-state__stat">
            <Hash size={14} strokeWidth={1.5} />
            <div className="agent-empty-state__stat-content">
              <span className="agent-empty-state__stat-value">{meta.runCount}</span>
              <span className="agent-empty-state__stat-label">Total runs</span>
            </div>
          </div>
          <div className="agent-empty-state__stat">
            <Zap size={14} strokeWidth={1.5} />
            <div className="agent-empty-state__stat-content">
              <span className="agent-empty-state__stat-value">
                {meta.tokenBudget
                  ? `${Math.round(meta.tokenBudget.usedThisMonth / 1000)}k`
                  : 'Unlimited'}
              </span>
              <span className="agent-empty-state__stat-label">Tokens used</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        {meta.instructions && (
          <div className="agent-empty-state__instructions">
            <button
              type="button"
              className="agent-empty-state__instructions-toggle"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              <span>Instructions</span>
              {showInstructions ? (
                <ChevronUp size={14} strokeWidth={1.5} />
              ) : (
                <ChevronDown size={14} strokeWidth={1.5} />
              )}
            </button>
            {showInstructions && (
              <pre className="agent-empty-state__instructions-body">{meta.instructions}</pre>
            )}
          </div>
        )}

        {/* Scheduler Debug */}
        {meta.schedule?.cron && (
          <div className="agent-empty-state__scheduler-debug">
            <div className="agent-empty-state__debug-title">
              <Timer size={12} strokeWidth={1.5} />
              <span>Scheduler</span>
            </div>
            <div className="agent-empty-state__debug-grid">
              <span className="agent-empty-state__debug-label">Cron</span>
              <code className="agent-empty-state__debug-value">{meta.schedule.cron}</code>
              <span className="agent-empty-state__debug-label">Status</span>
              <span className={`agent-empty-state__debug-value agent-empty-state__debug-status--${meta.status}`}>
                {meta.status}
              </span>
              <span className="agent-empty-state__debug-label">Next run</span>
              <span className="agent-empty-state__debug-value">
                {meta.nextRunAt ? formatAbsoluteTime(meta.nextRunAt) : 'Not scheduled'}
              </span>
              <span className="agent-empty-state__debug-label">Last run</span>
              <span className="agent-empty-state__debug-value">
                {meta.lastRunAt ? formatAbsoluteTime(meta.lastRunAt) : 'Never'}
              </span>
            </div>
          </div>
        )}

        {/* Run History */}
        <div className="agent-empty-state__run-history">
          <button
            type="button"
            className="agent-empty-state__instructions-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            <span>Run History ({meta.runHistory?.length ?? 0})</span>
            {showHistory ? (
              <ChevronUp size={14} strokeWidth={1.5} />
            ) : (
              <ChevronDown size={14} strokeWidth={1.5} />
            )}
          </button>
          {showHistory && (
            <div className="agent-empty-state__run-list">
              {!meta.runHistory?.length ? (
                <div className="agent-empty-state__run-empty">No runs yet</div>
              ) : (
                [...meta.runHistory].reverse().map((run, i) => (
                  <RunEntry key={run.startedAt} run={run} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="agent-empty-state__actions">
          <button
            type="button"
            className={`agent-empty-state__run-btn${isRunning ? ' agent-empty-state__run-btn--stop' : ''}`}
            onClick={handleRunStop}
          >
            {isRunning ? (
              <>
                <Square size={14} strokeWidth={1.5} />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play size={14} strokeWidth={1.5} />
                <span>Run now</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
