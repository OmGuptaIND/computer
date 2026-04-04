import { ArrowLeft, BarChart3, Files, ListChecks, Loader2, Lock, MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import { connection } from '../../lib/connection.js'
import type { Skill } from '../../lib/skills.js'
import type { ChatImageAttachment } from '../../lib/store.js'
import { useStore } from '../../lib/store.js'
import { ChatInput } from '../chat/ChatInput.js'
import { ConfirmDialog } from '../chat/ConfirmDialog.js'
import { MessageList } from '../chat/MessageList.js'
import { PlanReviewOverlay } from '../chat/PlanReviewOverlay.js'

export function TaskDetailView() {
  const activeConv = useStore((s) => s.getActiveConversation())
  const addMessage = useStore((s) => s.addMessage)
  const currentTasks = useStore((s) => s.currentTasks)
  const [todoOpen, setTodoOpen] = useState(false)

  const pendingConfirm = useStore((s) => {
    const confirm = s.pendingConfirm
    if (!confirm) return null
    const active = s.getActiveConversation()
    return !confirm.sessionId || confirm.sessionId === active?.sessionId ? confirm : null
  })
  const setPendingConfirm = useStore((s) => s.setPendingConfirm)

  const pendingAskUser = useStore((s) => {
    const ask = s.pendingAskUser
    if (!ask) return null
    const active = s.getActiveConversation()
    return !ask.sessionId || ask.sessionId === active?.sessionId ? ask : null
  })
  const setPendingAskUser = useStore((s) => s.setPendingAskUser)

  const messages = activeConv?.messages || []
  const isSyncing = useStore((s) => {
    const sid = s.getActiveConversation()?.sessionId
    return sid ? s._syncingSessionIds.has(sid) : false
  })

  const artifacts = useStore((s) => s.artifacts)

  const handleSend = useCallback(
    async (text: string, attachments: ChatImageAttachment[] = []) => {
      const store = useStore.getState()
      const conv = store.getActiveConversation()
      const sessionId = conv?.sessionId || store.currentSessionId
      if (!sessionId) return

      const outboundAttachments = attachments.flatMap((a) =>
        a.data ? [{ id: a.id, name: a.name, mimeType: a.mimeType, data: a.data, sizeBytes: a.sizeBytes }] : [],
      )

      addMessage({
        id: `user_${Date.now()}`,
        role: 'user',
        content: text,
        attachments,
        timestamp: Date.now(),
      })

      connection.sendAiMessageToSession(text, sessionId, outboundAttachments)
    },
    [addMessage],
  )

  const handleSteer = useCallback((text: string) => {
    const store = useStore.getState()
    const conv = store.getActiveConversation()
    const sessionId = conv?.sessionId || store.currentSessionId
    if (!sessionId) return
    connection.sendSteerMessage(text, sessionId)
  }, [])

  const handleCancelTurn = useCallback(() => {
    const store = useStore.getState()
    const conv = store.getActiveConversation()
    const sessionId = conv?.sessionId || store.currentSessionId
    if (!sessionId) return
    connection.sendCancelTurn(sessionId)
  }, [])

  const handleConfirm = useCallback(
    (approved: boolean) => {
      if (!pendingConfirm) return
      connection.sendConfirmResponse(pendingConfirm.id, approved)
      addMessage({
        id: `confirm_${Date.now()}`,
        role: 'system',
        content: approved
          ? `Approved: ${pendingConfirm.command}`
          : `Denied: ${pendingConfirm.command}`,
        timestamp: Date.now(),
      })
      setPendingConfirm(null)
    },
    [pendingConfirm, addMessage, setPendingConfirm],
  )

  const handleAskUserSubmit = useCallback(
    (answers: Record<string, string>) => {
      if (!pendingAskUser) return
      connection.sendAskUserResponse(pendingAskUser.id, answers)
      const summary = Object.entries(answers)
        .map(([q, a]) => `**${q}** → ${a}`)
        .join('\n')
      addMessage({
        id: `askuser_${Date.now()}`,
        role: 'system',
        content: summary,
        timestamp: Date.now(),
      })
      setPendingAskUser(null)
    },
    [pendingAskUser, addMessage, setPendingAskUser],
  )

  const handleSkillSelect = (_skill: Skill) => {}

  // No conversation selected — don't render (parent shows full-width task list)
  if (!activeConv || messages.length === 0) {
    return null
  }

  return (
    <div className="conv-panel">
      {/* Top bar — Perplexity style: back + title | icon buttons */}
      <div className="conv-panel__topbar">
        <button
          type="button"
          className="conv-panel__back"
          onClick={() => {
            useStore.getState().switchConversation('')
          }}
          aria-label="Back to all tasks"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
        <div className="conv-panel__title">
          {activeConv?.title || 'New task'}
        </div>

        <div className="conv-panel__actions">
          <button type="button" className="conv-panel__action-btn" aria-label="More options">
            <MoreHorizontal size={18} strokeWidth={1.5} />
          </button>
          {artifacts.length > 0 && (
            <button type="button" className="conv-panel__action-btn conv-panel__action-btn--label" aria-label="Files">
              <Files size={15} strokeWidth={1.5} />
              <span>{artifacts.length}</span>
            </button>
          )}
          <button type="button" className="conv-panel__action-btn" aria-label="Usage">
            <BarChart3 size={18} strokeWidth={1.5} />
          </button>
          {currentTasks.length > 0 && (
            <div className="conv-panel__todo-wrap">
              <button
                type="button"
                className="conv-panel__action-btn"
                onClick={() => setTodoOpen(!todoOpen)}
                aria-label="Todo"
              >
                <ListChecks size={18} strokeWidth={1.5} />
              </button>
              {todoOpen && (
                <>
                  <div
                    className="conv-panel__todo-backdrop"
                    onClick={() => setTodoOpen(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setTodoOpen(false) }}
                  />
                  <div className="conv-panel__todo-dropdown">
                    <div className="conv-panel__todo-title">{activeConv?.title || 'Tasks'}</div>
                    {currentTasks.map((task, i) => (
                      <div key={i} className="conv-panel__todo-item">
                        <span className={`conv-panel__todo-icon conv-panel__todo-icon--${task.status}`}>
                          {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '◎' : '○'}
                        </span>
                        <span className={`conv-panel__todo-text${task.status === 'completed' ? ' conv-panel__todo-text--done' : ''}`}>
                          {task.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button type="button" className="conv-panel__action-btn" aria-label="Share">
            <Lock size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="conv-panel__messages">
        {isSyncing && messages.length === 0 ? (
          <div className="conv-panel__loading">
            <Loader2 size={20} strokeWidth={1.5} className="conv-panel__spinner" />
          </div>
        ) : (
          <MessageList messages={messages} />
        )}

        {pendingConfirm && (
          <div className="conv-panel__confirm">
            <ConfirmDialog
              command={pendingConfirm.command}
              reason={pendingConfirm.reason}
              onApprove={() => handleConfirm(true)}
              onDeny={() => handleConfirm(false)}
            />
          </div>
        )}

        <PlanReviewOverlay />
      </div>

      {/* Chat input */}
      <div className="conv-panel__input">
        <ChatInput
          onSend={handleSend}
          onSteer={handleSteer}
          onCancelTurn={handleCancelTurn}
          onSkillSelect={handleSkillSelect}
          pendingAskUser={pendingAskUser}
          onAskUserSubmit={handleAskUserSubmit}
          variant="minimal"
        />
      </div>
    </div>
  )
}
