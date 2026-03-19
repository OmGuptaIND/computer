import { useCallback, useEffect, useState } from 'react'
import { connection } from '../lib/connection.js'
import type { Skill } from '../lib/skills.js'
import { useStore } from '../lib/store.js'
import { ChatInput } from './chat/ChatInput.js'
import { ConfirmDialog } from './chat/ConfirmDialog.js'
import { EmptyState } from './chat/EmptyState.js'
import { MessageList } from './chat/MessageList.js'
import { ModelSelector } from './chat/ModelSelector.js'
import { SkillDialog } from './skills/SkillDialog.js'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function AgentChat() {
  const activeConv = useStore((s) => s.getActiveConversation())
  const addMessage = useStore((s) => s.addMessage)
  const newConversation = useStore((s) => s.newConversation)
  const pendingConfirm = useStore((s) => s.pendingConfirm)
  const setPendingConfirm = useStore((s) => s.setPendingConfirm)
  const _currentSessionId = useStore((s) => s.currentSessionId)
  const currentProvider = useStore((s) => s.currentProvider)
  const currentModel = useStore((s) => s.currentModel)
  const sessionUsage = useStore((s) => s.sessionUsage)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  // Auto-create a conversation + server session if none active
  useEffect(() => {
    if (!activeConv) {
      const sessionId = `sess_${Date.now().toString(36)}`
      newConversation(undefined, sessionId)
      connection.sendSessionCreate(sessionId, {
        provider: currentProvider,
        model: currentModel,
      })
    }
  }, [activeConv, newConversation, currentProvider, currentModel])

  const handleSend = useCallback(
    (text: string) => {
      const store = useStore.getState()
      let sessionId = store.currentSessionId

      if (!store.activeConversationId) {
        sessionId = `sess_${Date.now().toString(36)}`
        newConversation(undefined, sessionId)
        connection.sendSessionCreate(sessionId, {
          provider: store.currentProvider,
          model: store.currentModel,
        })
      }

      addMessage({
        id: `user_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      })

      if (sessionId) {
        connection.sendAiMessageToSession(text, sessionId)
      } else {
        connection.sendAiMessage(text)
      }
    },
    [addMessage, newConversation],
  )

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

  const messages = activeConv?.messages || []

  return (
    <div className="chat-shell">
      <div className="chat-shell__header">
        <ModelSelector />
        {sessionUsage && (
          <span
            className="token-badge"
            title={`Input: ${sessionUsage.inputTokens} | Output: ${sessionUsage.outputTokens} | Cache read: ${sessionUsage.cacheReadTokens}`}
          >
            {formatTokens(sessionUsage.totalTokens)} tokens
          </span>
        )}
      </div>

      {messages.length === 0 ? (
        <EmptyState
          onSend={handleSend}
          onSkillSelect={setSelectedSkill}
          onSelectExample={(text) => {
            handleSend(text)
          }}
        />
      ) : (
        <MessageList messages={messages} />
      )}

      {pendingConfirm && (
        <div className="chat-shell__confirm">
          <ConfirmDialog
            command={pendingConfirm.command}
            reason={pendingConfirm.reason}
            onApprove={() => handleConfirm(true)}
            onDeny={() => handleConfirm(false)}
          />
        </div>
      )}

      {messages.length > 0 && <ChatInput onSend={handleSend} onSkillSelect={setSelectedSkill} />}

      <SkillDialog skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </div>
  )
}
