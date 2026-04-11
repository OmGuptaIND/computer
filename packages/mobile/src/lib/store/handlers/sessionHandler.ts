/**
 * AI channel: session lifecycle messages.
 */

import type { AiMessage, SessionHistoryEntry, SyncDelta } from '@anton/protocol'
import { saveSyncVersion } from '../../storage'
import { useStore } from '../../store'
import { connectionStore } from '../connectionStore'
import { sessionStore } from '../sessionStore'
import type { ChatMessage, Conversation, SessionMeta } from '../types'

function unwrapUserSteering(content: string): { content: string; isSteering: boolean } {
  const match = content.match(
    /^<user_steering>[\s\S]*?User message:\s*"([\s\S]*)"\s*<\/user_steering>\s*$/,
  )
  if (match) return { content: match[1], isSteering: true }
  return { content, isSteering: false }
}

export function handleSessionMessage(msg: AiMessage): boolean {
  switch (msg.type) {
    case 'session_created': {
      const ss = sessionStore.getState()
      ss.setCurrentSession(msg.id, msg.provider, msg.model)
      ss.resolvePendingSession(msg.id)
      useStore.getState().setCurrentSession(msg.id, msg.provider, msg.model)
      return true
    }

    case 'sessions_sync_response': {
      const syncVersion = msg.syncVersion as number
      const full = msg.full as boolean

      if (full) {
        const serverSessions = (msg.sessions || []) as SessionMeta[]
        sessionStore.getState().setSessions(serverSessions)

        const store = useStore.getState()
        const serverById = new Map(serverSessions.map((s) => [s.id, s]))
        const reconciled: Conversation[] = []

        for (const conv of store.conversations) {
          const serverMeta = serverById.get(conv.sessionId)
          if (serverMeta) {
            reconciled.push({
              ...conv,
              title: serverMeta.title || conv.title,
              updatedAt: serverMeta.lastActiveAt,
              provider: serverMeta.provider,
              model: serverMeta.model,
            })
            serverById.delete(conv.sessionId)
          } else if (!conv.sessionId.startsWith('sess_') || conv.pendingCreation) {
            reconciled.push(conv)
          }
        }

        for (const [, s] of serverById) {
          if (!s.id.startsWith('sess_')) continue
          if (s.messageCount === 0) continue
          reconciled.push({
            id: s.id,
            sessionId: s.id,
            title: s.title || 'New conversation',
            messages: [],
            createdAt: s.createdAt,
            updatedAt: s.lastActiveAt,
            provider: s.provider,
            model: s.model,
          })
        }

        useStore.setState({ conversations: reconciled })
      } else {
        const deltas = (msg.deltas || []) as SyncDelta[]
        const store = useStore.getState()
        let conversations = [...store.conversations]

        for (const delta of deltas) {
          const { action, sessionId, session } = delta
          if (!sessionId.startsWith('sess_')) continue
          const idx = conversations.findIndex((c) => c.sessionId === sessionId)

          if (action === 'I' && session && idx === -1 && session.messageCount > 0) {
            conversations.push({
              id: sessionId,
              sessionId,
              title: session.title || 'New conversation',
              messages: [],
              createdAt: session.createdAt,
              updatedAt: session.lastActiveAt,
              provider: session.provider,
              model: session.model,
            })
          } else if (action === 'U' && session && idx >= 0) {
            conversations[idx] = {
              ...conversations[idx],
              title: session.title || conversations[idx].title,
              updatedAt: session.lastActiveAt,
              provider: session.provider,
              model: session.model,
            }
          } else if (action === 'D') {
            conversations = conversations.filter((c) => c.sessionId !== sessionId)
            sessionStore.getState().removeSessionState(sessionId)
          }
        }

        useStore.setState({ conversations })

        // Rebuild sessions if needed
        const ss = sessionStore.getState()
        if (!ss.sessionsLoaded || ss.sessions.length === 0) {
          sessionStore.setState({ sessionsLoaded: true })
        }
      }

      saveSyncVersion(syncVersion)
      connectionStore.getState().markSynced('sessions')
      return true
    }

    case 'session_sync': {
      const delta = msg.delta as SyncDelta
      const syncVersion = msg.syncVersion as number
      const store = useStore.getState()
      let conversations = [...store.conversations]
      const { action, sessionId, session } = delta

      if (sessionId.startsWith('sess_')) {
        const idx = conversations.findIndex((c) => c.sessionId === sessionId)

        if (action === 'I' && session && idx === -1 && session.messageCount > 0) {
          conversations.push({
            id: sessionId,
            sessionId,
            title: session.title || 'New conversation',
            messages: [],
            createdAt: session.createdAt,
            updatedAt: session.lastActiveAt,
            provider: session.provider,
            model: session.model,
          })
        } else if (action === 'U' && session && idx >= 0) {
          conversations[idx] = {
            ...conversations[idx],
            title: session.title || conversations[idx].title,
            updatedAt: session.lastActiveAt,
          }
        } else if (action === 'D') {
          conversations = conversations.filter((c) => c.sessionId !== sessionId)
          sessionStore.getState().removeSessionState(sessionId)
        }

        useStore.setState({ conversations })
      }

      saveSyncVersion(syncVersion)
      return true
    }

    case 'session_history_response': {
      type HistoryEntry = SessionHistoryEntry & {
        attachments?: import('../types').ChatImageAttachment[]
        messageId?: string
        parentToolCallId?: string
      }

      const uiOnlyHistoryTools = new Set(['ask_user', 'task_tracker', 'plan_confirm'])
      const hiddenHistoryIds = new Set<string>()
      for (const entry of msg.messages as HistoryEntry[]) {
        if (
          entry.role === 'tool_call' &&
          entry.toolName &&
          uiOnlyHistoryTools.has(entry.toolName) &&
          entry.toolId
        ) {
          hiddenHistoryIds.add(entry.toolId)
        }
      }

      const historyMessages: ChatMessage[] = (msg.messages as HistoryEntry[])
        .filter((entry: HistoryEntry) => {
          if (entry.toolId && hiddenHistoryIds.has(entry.toolId)) return false
          return true
        })
        .map((entry: HistoryEntry) => {
          let id = entry.messageId || ''
          if (!id && entry.role === 'tool_call' && entry.toolId) {
            id = `tc_${entry.toolId}`
          } else if (!id && entry.role === 'tool_result' && entry.toolId) {
            id = `tr_${entry.toolId}`
          } else if (!id) {
            id = `hist_${entry.seq}`
          }
          const role =
            entry.role === 'user'
              ? 'user'
              : entry.role === 'assistant'
                ? 'assistant'
                : entry.role === 'tool_call' || entry.role === 'tool_result'
                  ? 'tool'
                  : 'system'

          let content = entry.content
          let isSteering = false
          if (role === 'user') {
            const unwrapped = unwrapUserSteering(content)
            content = unwrapped.content
            isSteering = unwrapped.isSteering
          }

          return {
            id,
            role,
            content,
            timestamp: entry.ts,
            attachments: entry.attachments,
            toolName: entry.toolName,
            toolInput: entry.toolInput,
            isError: entry.isError,
            isThinking: entry.isThinking,
            parentToolCallId: entry.parentToolCallId,
            isSteering,
          } as ChatMessage
        })

      const ss = sessionStore.getState()
      const isFirstPage = !ss.getSessionState(msg.id).isLoadingOlder
      ss.updateSessionState(msg.id, { hasMore: (msg.hasMore ?? false) as boolean })

      const store = useStore.getState()
      if (isFirstPage) {
        store.loadSessionMessages(msg.id, historyMessages)
      } else {
        store.prependSessionMessages(msg.id, historyMessages)
      }
      return true
    }

    case 'session_destroyed': {
      const ss = sessionStore.getState()
      ss.setSessions(ss.sessions.filter((s: SessionMeta) => s.id !== msg.id))
      ss.removeSessionState(msg.id as string)

      const store = useStore.getState()
      const updated = store.conversations.filter((c) => c.sessionId !== msg.id)
      useStore.setState({ conversations: updated })
      return true
    }

    case 'usage_stats_response':
      return true

    case 'context_info':
      return true

    default:
      return false
  }
}
