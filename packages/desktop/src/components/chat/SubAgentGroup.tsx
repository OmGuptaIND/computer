import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { type ChatMessage, useStore } from '../../lib/store.js'
import { ToolTreeItem, getGroupHeader } from './ActionsGroup.js'
import { ArtifactCard } from './ArtifactCard.js'
import type { ToolAction } from './groupMessages.js'

interface Props {
  toolCallId: string
  task: string
  actions: ToolAction[]
  result: ChatMessage | null
  defaultExpanded?: boolean
}

export function SubAgentGroup({ task, actions, result, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const artifacts = useStore((s) => s.artifacts)

  const actionCallIds = useMemo(() => new Set(actions.map((a) => a.call.id)), [actions])
  const groupArtifacts = useMemo(
    () => artifacts.filter((a) => actionCallIds.has(a.toolCallId)),
    [artifacts, actionCallIds],
  )

  const isPending = !result
  const _isError = result?.isError
  const errorCount = actions.filter((a) => a.result?.isError).length

  useEffect(() => {
    if (defaultExpanded || isPending) setExpanded(true)
  }, [defaultExpanded, isPending])

  const taskPreview = task.length > 80 ? `${task.slice(0, 77)}...` : task

  // Build summary like "Read · Shell · 4 tool calls"
  const actionsSummary = actions.length > 0 ? getGroupHeader(actions) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="tool-tree tool-tree--sub-agent"
    >
      {/* Header */}
      <button type="button" className="tool-tree__header" onClick={() => setExpanded(!expanded)}>
        {expanded ? (
          <ChevronDown size={14} strokeWidth={1.5} className="tool-tree__chevron" />
        ) : (
          <ChevronRight size={14} strokeWidth={1.5} className="tool-tree__chevron" />
        )}
        <span className="sub-agent__label">Agent</span>
        <span className="sub-agent__task">{taskPreview}</span>
      </button>

      {/* Summary line: tool names · N tool calls */}
      {(actionsSummary || errorCount > 0) && (
        <div className="sub-agent__summary">
          {actionsSummary && <span className="sub-agent__tools">{actionsSummary}</span>}
          {errorCount > 0 && <span className="tool-tree__error-badge">{errorCount} failed</span>}
        </div>
      )}

      {/* Nested tool call tree */}
      <AnimatePresence>
        {expanded && actions.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="tool-tree__items">
              {actions.map((action, i) => (
                <ToolTreeItem
                  key={action.call.id}
                  action={action}
                  isLast={i === actions.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline artifact cards */}
      {groupArtifacts.length > 0 && (
        <div className="tool-tree__artifacts">
          {groupArtifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
