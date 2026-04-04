import type { WorkflowPipelineStep } from '@anton/protocol'
import { BarChart3, Mail, MessageSquare, Search, Send, Table, Zap } from 'lucide-react'

// ── Icon mapping ──────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  mail: <Mail size={16} strokeWidth={1.5} />,
  search: <Search size={16} strokeWidth={1.5} />,
  'bar-chart': <BarChart3 size={16} strokeWidth={1.5} />,
  table: <Table size={16} strokeWidth={1.5} />,
  send: <Send size={16} strokeWidth={1.5} />,
  'message-square': <MessageSquare size={16} strokeWidth={1.5} />,
  zap: <Zap size={16} strokeWidth={1.5} />,
}

function StepIcon({ icon }: { icon?: string }) {
  if (icon && ICON_MAP[icon]) return <>{ICON_MAP[icon]}</>
  return <Zap size={16} strokeWidth={1.5} />
}

// ── Type labels + colors ──────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  agent: 'Agent',
  connector: 'Connector',
  action: 'Action',
}

// ── Rendering algorithm ───────────────────────────────────────────

interface Level {
  steps: WorkflowPipelineStep[]
}

function buildLevels(steps: WorkflowPipelineStep[]): Level[] {
  if (steps.length === 0) return []

  const stepMap = new Map(steps.map((s) => [s.id, s]))
  const incoming = new Set<string>()
  for (const step of steps) {
    for (const next of step.next || []) {
      incoming.add(next)
    }
  }

  // Find roots (no incoming edges)
  const roots = steps.filter((s) => !incoming.has(s.id))
  if (roots.length === 0) return [{ steps }]

  const levels: Level[] = []
  const visited = new Set<string>()
  let currentIds = roots.map((r) => r.id)

  while (currentIds.length > 0) {
    const levelSteps: WorkflowPipelineStep[] = []
    const nextIds: string[] = []

    for (const id of currentIds) {
      if (visited.has(id)) continue
      visited.add(id)
      const step = stepMap.get(id)
      if (step) {
        levelSteps.push(step)
        for (const next of step.next || []) {
          if (!visited.has(next)) nextIds.push(next)
        }
      }
    }

    if (levelSteps.length > 0) {
      levels.push({ steps: levelSteps })
    }
    currentIds = [...new Set(nextIds)]
  }

  return levels
}

// ── Component ─────────────────────────────────────────────────────

interface Props {
  steps: WorkflowPipelineStep[]
  onStepClick?: (stepId: string) => void
  activeStepId?: string
}

export function WorkflowPipelineView({ steps, onStepClick, activeStepId }: Props) {
  const levels = buildLevels(steps)

  if (levels.length === 0) {
    return (
      <div className="wf-pipeline wf-pipeline--empty">
        <p>No pipeline defined for this workflow.</p>
      </div>
    )
  }

  return (
    <div className="wf-pipeline">
      {levels.map((level, levelIdx) => (
        <div key={level.steps.map((s) => s.id).join('-')}>
          {/* Connector line between levels */}
          {levelIdx > 0 && (
            <div className="wf-pipeline__connector">
              <div className="wf-pipeline__line" />
              {level.steps.length > 1 && <div className="wf-pipeline__fork-line" />}
            </div>
          )}

          {/* Level row */}
          <div
            className={`wf-pipeline__level${level.steps.length > 1 ? ' wf-pipeline__level--fork' : ''}`}
          >
            {level.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`wf-pipeline__step wf-pipeline__step--${step.type}${activeStepId === step.id ? ' wf-pipeline__step--active' : ''}`}
                onClick={() => onStepClick?.(step.id)}
                disabled={!onStepClick}
              >
                <div className="wf-pipeline__step-icon">
                  <StepIcon icon={step.icon} />
                </div>
                <div className="wf-pipeline__step-content">
                  <span className="wf-pipeline__step-label">{step.label}</span>
                  {step.description && (
                    <span className="wf-pipeline__step-desc">{step.description}</span>
                  )}
                </div>
                <span className="wf-pipeline__step-type">
                  {TYPE_LABELS[step.type] || step.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
