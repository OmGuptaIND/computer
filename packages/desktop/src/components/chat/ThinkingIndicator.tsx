import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  FolderOpen,
  Globe,
  Loader2,
  Terminal,
  Wifi,
  Wrench,
  XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgentStep } from '../../lib/store.js'
import { useStore } from '../../lib/store.js'
import { AntonLogo } from '../AntonLogo.js'

const STATUS_PHRASES = [
  'Thinking',
  'Pondering',
  'Working on it',
  'Processing',
  'Reasoning',
]

const toolIcons: Record<string, React.ElementType> = {
  shell: Terminal,
  filesystem: FolderOpen,
  browser: Globe,
  process: Cpu,
  network: Wifi,
}

function StepIcon({ step }: { step: AgentStep }) {
  if (step.status === 'active') {
    return <Loader2 size={14} className="thinking-indicator__spin" />
  }
  if (step.status === 'error') {
    return <XCircle size={14} className="thinking-indicator__step-icon--error" />
  }
  return <CheckCircle size={14} className="thinking-indicator__step-icon--done" />
}

function ToolIcon({ toolName }: { toolName?: string }) {
  const Icon = (toolName && toolIcons[toolName]) || Wrench
  return <Icon size={14} className="thinking-indicator__tool-icon" />
}

export function ThinkingIndicator() {
  const agentStatus = useStore((s) => s.agentStatus)
  const agentStatusDetail = useStore((s) => s.agentStatusDetail)
  const agentSteps = useStore((s) => s.agentSteps)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [stepsExpanded, setStepsExpanded] = useState(true)

  // Cycle through status phrases
  useEffect(() => {
    if (agentStatus !== 'working') return
    const interval = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % STATUS_PHRASES.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [agentStatus])

  if (agentStatus !== 'working') return null

  const activeSteps = agentSteps.filter((s) => s.status === 'active')
  const completedSteps = agentSteps.filter((s) => s.status !== 'active')
  const hasSteps = agentSteps.length > 0

  // Determine display text
  const statusText = agentStatusDetail || STATUS_PHRASES[phraseIdx]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="thinking-indicator"
      >
        {/* Main status row */}
        <div className="thinking-indicator__header">
          <AntonLogo size={24} thinking={true} className="thinking-indicator__logo" />
          <span className="thinking-indicator__status">
            {statusText}
            <span className="thinking-indicator__dots">
              <span className="thinking-indicator__dot" />
              <span className="thinking-indicator__dot" />
              <span className="thinking-indicator__dot" />
            </span>
          </span>
        </div>

        {/* Step tree (Perplexity-style) */}
        {hasSteps && (
          <div className="thinking-indicator__steps-wrap">
            <button
              type="button"
              className="thinking-indicator__steps-toggle"
              onClick={() => setStepsExpanded(!stepsExpanded)}
            >
              {stepsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>
                {activeSteps.length > 0
                  ? `Running ${activeSteps.length} task${activeSteps.length > 1 ? 's' : ''}`
                  : `${completedSteps.length} step${completedSteps.length > 1 ? 's' : ''} completed`}
              </span>
            </button>

            <AnimatePresence>
              {stepsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="thinking-indicator__steps-list"
                >
                  {agentSteps.map((step) => (
                    <div key={step.id} className="thinking-indicator__step">
                      <div className="thinking-indicator__step-line" />
                      <ToolIcon toolName={step.toolName} />
                      <span className="thinking-indicator__step-label">{step.label}</span>
                      <StepIcon step={step} />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
