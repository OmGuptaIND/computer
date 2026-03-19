import { useCallback, useEffect, useState } from 'react'
import { connection } from '../lib/connection.js'
import type { Skill } from '../lib/skills.js'
import { useStore } from '../lib/store.js'
import { ChatInput } from './chat/ChatInput.js'
import { ConfirmDialog } from './chat/ConfirmDialog.js'
import { EmptyState } from './chat/EmptyState.js'
import { MessageList } from './chat/MessageList.js'
import { SkillDialog } from './skills/SkillDialog.js'

export function AgentChat() {
  const activeConv = useStore((s) => s.getActiveConversation())
  const addMessage = useStore((s) => s.addMessage)
  const newConversation = useStore((s) => s.newConversation)
  const pendingConfirm = useStore((s) => s.pendingConfirm)
  const setPendingConfirm = useStore((s) => s.setPendingConfirm)
  const currentProvider = useStore((s) => s.currentProvider)
  const currentModel = useStore((s) => s.currentModel)
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  // Auto-create a conversation + session on mount if none exists
  useEffect(() => {
    if (!activeConv) {
      const sessionId = `sess_${Date.now().toString(36)}`
      newConversation(undefined, sessionId)
      const store = useStore.getState()
      store.registerPendingSession(sessionId)
      connection.sendSessionCreate(sessionId, {
        provider: currentProvider,
        model: currentModel,
      })
    }
  }, [activeConv, newConversation, currentProvider, currentModel])

  const handleSend = useCallback(
    async (text: string) => {
      const store = useStore.getState()
      const conv = store.getActiveConversation()
      let sessionId = conv?.sessionId || store.currentSessionId

      if (!conv) {
        // No conversation at all — create one
        sessionId = `sess_${Date.now().toString(36)}`
        newConversation(undefined, sessionId)
        const waitPromise = store.registerPendingSession(sessionId)
        connection.sendSessionCreate(sessionId, {
          provider: store.currentProvider,
          model: store.currentModel,
        })
        await waitPromise
      } else if (sessionId && !store.currentSessionId) {
        // Conversation exists but session hasn't been confirmed yet — wait for it
        const resolvers = store._sessionResolvers
        if (resolvers.has(sessionId)) {
          await new Promise<void>((resolve) => {
            const existing = resolvers.get(sessionId!)
            // Chain: resolve the original AND our new waiter
            resolvers.set(sessionId!, () => {
              existing?.()
              resolve()
            })
          })
        }
      }

      // Re-read sessionId after potential await
      const freshStore = useStore.getState()
      sessionId = freshStore.currentSessionId || sessionId

      addMessage({
        id: `user_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      })

      if (sessionId) {
        connection.sendAiMessageToSession(text, sessionId)
      } else {
        // Absolute fallback — should not normally happen
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
      {messages.length === 0 ? (
        <EmptyState
          onSend={handleSend}
          onSkillSelect={setSelectedSkill}
          onSelectExample={(text) => handleSend(text)}
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
