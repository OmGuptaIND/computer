/**
 * Main app store — conversations, messages, and top-level state.
 * Adapted from desktop store for React Native.
 */

import { Channel } from '@anton/protocol'
import { create } from 'zustand'
import { type ConnectionStatus, connection } from './connection'
import { connectionStore } from './store/connectionStore'
import { handleWsMessage } from './store/handlers/index'
import { projectStore } from './store/projectStore'
import { sessionStore } from './store/sessionStore'
import type { ChatMessage, Conversation } from './store/types'

function autoTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return 'New conversation'
  const text = first.content.trim()
  return text.length > 50 ? `${text.slice(0, 50)}...` : text
}

interface AppState {
  connectionStatus: ConnectionStatus
  conversations: Conversation[]
  activeConversationId: string | null

  _sessionAssistantMsgIds: Map<string, string>
  _sessionThinkingMsgIds: Map<string, string>
  _subAgentProgressMsgIds: Map<string, string>

  setConnectionStatus: (status: ConnectionStatus) => void
  setCurrentSession: (id: string, provider: string, model: string) => void

  newConversation: (title?: string, sessionId?: string, projectId?: string) => string
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  addMessage: (msg: ChatMessage) => void
  addMessageToSession: (sessionId: string, msg: ChatMessage) => void
  appendAssistantText: (content: string) => void
  appendAssistantTextToSession: (sessionId: string, content: string) => void
  appendThinkingText: (content: string) => void
  appendThinkingTextToSession: (sessionId: string, content: string) => void
  appendSubAgentProgress: (toolCallId: string, content: string, parentToolCallId: string) => void
  appendSubAgentProgressToSession: (
    sessionId: string,
    toolCallId: string,
    content: string,
    parentToolCallId: string,
  ) => void
  replaceAssistantText: (search: string, replacement: string, sessionId?: string) => void
  getActiveConversation: () => Conversation | null
  findConversationBySession: (sessionId: string) => Conversation | undefined
  loadSessionMessages: (sessionId: string, messages: ChatMessage[]) => void
  prependSessionMessages: (sessionId: string, messages: ChatMessage[]) => void
  requestSessionHistory: (sessionId: string) => void
  loadOlderMessages: (sessionId: string) => void
  updateConversationTitle: (sessionId: string, title: string) => void
  registerPendingSession: (id: string) => Promise<void>
  resolvePendingSession: (id: string) => void
  resetForDisconnect: () => void
}

export const useStore = create<AppState>((set, get) => ({
  connectionStatus: 'disconnected',
  conversations: [],
  activeConversationId: null,
  _sessionAssistantMsgIds: new Map(),
  _sessionThinkingMsgIds: new Map(),
  _subAgentProgressMsgIds: new Map(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setCurrentSession: (_id, provider, model) => {
    set((state) => {
      const activeId = state.activeConversationId
      const conversations = activeId
        ? state.conversations.map((c) =>
            c.id === activeId ? { ...c, provider, model, updatedAt: Date.now() } : c,
          )
        : state.conversations
      return { conversations }
    })
  },

  newConversation: (title, sessionId, projectId) => {
    const ss = sessionStore.getState()
    const convSessionId = sessionId || `sess_${Date.now()}`
    const conv: Conversation = {
      id: convSessionId,
      sessionId: convSessionId,
      title: title || 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provider: ss.currentProvider,
      model: ss.currentModel,
      projectId,
    }
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
    }))
    return conv.id
  },

  switchConversation: (id) => {
    const conv = get().conversations.find((c) => c.id === id)
    const ss = sessionStore.getState()
    if (conv?.sessionId) {
      ss.setCurrentSession(
        conv.sessionId,
        conv.provider || ss.currentProvider,
        conv.model || ss.currentModel,
      )
    }

    if (conv?.sessionId && ss.getSessionState(conv.sessionId).needsHistoryRefresh) {
      ss.updateSessionState(conv.sessionId, { needsHistoryRefresh: false })
      get().requestSessionHistory(conv.sessionId)
    }

    set({ activeConversationId: id })
  },

  deleteConversation: (id) => {
    const conv = get().conversations.find((c) => c.id === id)
    const ss = sessionStore.getState()
    if (conv?.sessionId) {
      ss.destroySession(conv.sessionId)
      ss.removeSessionState(conv.sessionId)
      get()._sessionAssistantMsgIds.delete(conv.sessionId)
      get()._sessionThinkingMsgIds.delete(conv.sessionId)
    }

    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      const activeConversationId =
        state.activeConversationId === id
          ? (conversations[0]?.id ?? null)
          : state.activeConversationId
      if (activeConversationId) {
        const nextConv = conversations.find((c) => c.id === activeConversationId)
        if (nextConv?.sessionId) {
          ss.setCurrentSession(
            nextConv.sessionId,
            nextConv.provider || ss.currentProvider,
            nextConv.model || ss.currentModel,
          )
        }
      }
      return { conversations, activeConversationId }
    })
  },

  addMessage: (msg) => {
    set((state) => {
      const activeId = state.activeConversationId
      if (!activeId) return state
      const conversations = state.conversations.map((c) => {
        if (c.id !== activeId) return c
        const messages = [...c.messages, msg]
        const title = c.messages.length === 0 && msg.role === 'user' ? autoTitle(messages) : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  addMessageToSession: (sessionId, msg) => {
    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        const messages = [...c.messages, msg]
        const title = c.messages.length === 0 && msg.role === 'user' ? autoTitle(messages) : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  appendAssistantText: (content) => {
    set((state) => {
      const activeId = state.activeConversationId
      if (!activeId) return state
      const conv = state.conversations.find((c) => c.id === activeId)
      const sessionId = conv?.sessionId
      let newMsgId: string | null = null

      const conversations = state.conversations.map((c) => {
        if (c.id !== activeId) return c
        const messages = [...c.messages]
        const targetId = sessionId ? (state._sessionAssistantMsgIds.get(sessionId) ?? null) : null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          newMsgId = `msg_${Date.now()}`
          messages.push({
            id: newMsgId,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          })
        }
        return { ...c, messages, updatedAt: Date.now() }
      })

      if (newMsgId && sessionId) {
        state._sessionAssistantMsgIds.set(sessionId, newMsgId)
      }
      return { conversations }
    })
  },

  appendAssistantTextToSession: (sessionId, content) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.sessionId === sessionId)
      if (!conv) return state
      let newMsgId: string | null = null

      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        const messages = [...c.messages]
        const targetId = state._sessionAssistantMsgIds.get(sessionId) ?? null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          newMsgId = `msg_${Date.now()}`
          messages.push({
            id: newMsgId,
            role: 'assistant',
            content,
            timestamp: Date.now(),
          })
        }
        return { ...c, messages, updatedAt: Date.now() }
      })

      if (newMsgId) {
        state._sessionAssistantMsgIds.set(sessionId, newMsgId)
      }
      return { conversations }
    })
  },

  appendThinkingText: (content) => {
    set((state) => {
      const activeId = state.activeConversationId
      if (!activeId) return state
      const conv = state.conversations.find((c) => c.id === activeId)
      const sessionId = conv?.sessionId
      let newMsgId: string | null = null

      const conversations = state.conversations.map((c) => {
        if (c.id !== activeId) return c
        const messages = [...c.messages]
        const targetId = sessionId ? (state._sessionThinkingMsgIds.get(sessionId) ?? null) : null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          newMsgId = `think_${Date.now()}`
          messages.push({
            id: newMsgId,
            role: 'assistant',
            content,
            isThinking: true,
            timestamp: Date.now(),
          })
        }
        return { ...c, messages, updatedAt: Date.now() }
      })

      if (newMsgId && sessionId) {
        state._sessionThinkingMsgIds.set(sessionId, newMsgId)
      }
      return { conversations }
    })
  },

  appendThinkingTextToSession: (sessionId, content) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.sessionId === sessionId)
      if (!conv) return state

      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        const messages = [...c.messages]
        const targetId = state._sessionThinkingMsgIds.get(sessionId) ?? null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          const newId = `think_${Date.now()}`
          messages.push({
            id: newId,
            role: 'assistant',
            content,
            isThinking: true,
            timestamp: Date.now(),
          })
          state._sessionThinkingMsgIds.set(sessionId, newId)
        }
        return { ...c, messages, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  appendSubAgentProgress: (toolCallId, content, parentToolCallId) => {
    set((state) => {
      const activeId = state.activeConversationId
      if (!activeId) return state
      const conversations = state.conversations.map((c) => {
        if (c.id !== activeId) return c
        const messages = [...c.messages]
        const targetId = state._subAgentProgressMsgIds.get(toolCallId) ?? null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          const newId = `sa_progress_${toolCallId}`
          messages.push({
            id: newId,
            role: 'assistant',
            content,
            timestamp: Date.now(),
            parentToolCallId,
          })
          state._subAgentProgressMsgIds.set(toolCallId, newId)
        }
        return { ...c, messages, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  appendSubAgentProgressToSession: (sessionId, toolCallId, content, parentToolCallId) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.sessionId === sessionId)
      if (!conv) return state
      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        const messages = [...c.messages]
        const targetId = state._subAgentProgressMsgIds.get(toolCallId) ?? null
        const idx = targetId ? messages.findIndex((m) => m.id === targetId) : -1

        if (idx >= 0) {
          const target = messages[idx]
          messages[idx] = { ...target, content: target.content + content }
        } else {
          const newId = `sa_progress_${toolCallId}`
          messages.push({
            id: newId,
            role: 'assistant',
            content,
            timestamp: Date.now(),
            parentToolCallId,
          })
          state._subAgentProgressMsgIds.set(toolCallId, newId)
        }
        return { ...c, messages, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  replaceAssistantText: (search, replacement, sessionId?) => {
    set((state) => {
      const conv = sessionId
        ? state.conversations.find((c) => c.sessionId === sessionId)
        : state.conversations.find((c) => c.id === state.activeConversationId)
      if (!conv) return state

      const resolvedSessionId = sessionId || conv.sessionId
      const targetId = resolvedSessionId
        ? state._sessionAssistantMsgIds.get(resolvedSessionId)
        : undefined
      if (!targetId) return state

      const conversations = state.conversations.map((c) => {
        if (c.id !== conv.id) return c
        const messages = c.messages.map((m) => {
          if (m.id !== targetId) return m
          return { ...m, content: m.content.replace(search, replacement) }
        })
        return { ...c, messages, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  getActiveConversation: () => {
    const { conversations, activeConversationId } = get()
    return conversations.find((c) => c.id === activeConversationId) || null
  },

  findConversationBySession: (sessionId) => {
    return get().conversations.find((c) => c.sessionId === sessionId)
  },

  loadSessionMessages: (sessionId, serverMessages) => {
    const ss = sessionStore.getState()
    const queuedMessages = ss.getSessionState(sessionId).pendingSyncMessages

    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        return { ...c, messages: serverMessages }
      })
      return { conversations }
    })

    ss.updateSessionState(sessionId, { isSyncing: false, pendingSyncMessages: [] })

    if (queuedMessages.length > 0) {
      for (const queued of queuedMessages) {
        handleWsMessage(Channel.AI, queued)
      }
    }
  },

  prependSessionMessages: (sessionId, olderMessages) => {
    set((state) => {
      const conv = state.conversations.find((c) => c.sessionId === sessionId)
      if (!conv) return state
      const existingIds = new Set(conv.messages.map((m) => m.id))
      const newMessages = olderMessages.filter((m) => !existingIds.has(m.id))
      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        return { ...c, messages: [...newMessages, ...c.messages] }
      })
      return { conversations }
    })
    sessionStore.getState().updateSessionState(sessionId, { isLoadingOlder: false })
  },

  requestSessionHistory: (sessionId) => {
    const ss = sessionStore.getState()
    ss.updateSessionState(sessionId, { isSyncing: true })
    const conv = get().conversations.find((c) => c.sessionId === sessionId)
    connection.sendSessionHistory(sessionId, { projectId: conv?.projectId })

    setTimeout(() => {
      const ssNow = sessionStore.getState()
      const state = ssNow.getSessionState(sessionId)
      if (state.isSyncing) {
        const queued = state.pendingSyncMessages
        ssNow.updateSessionState(sessionId, { isSyncing: false, pendingSyncMessages: [] })
        for (const msg of queued) {
          handleWsMessage(Channel.AI, msg)
        }
      }
    }, 5000)
  },

  loadOlderMessages: (sessionId) => {
    const ss = sessionStore.getState()
    const sessionState = ss.getSessionState(sessionId)
    if (sessionState.isLoadingOlder || !sessionState.hasMore) return

    const conv = get().conversations.find((c) => c.sessionId === sessionId)
    if (!conv || conv.messages.length === 0) return

    let minSeq = Number.MAX_SAFE_INTEGER
    for (const m of conv.messages) {
      const match = m.id.match(/^hist_(\d+)_/)
      if (match) {
        minSeq = Math.min(minSeq, Number.parseInt(match[1], 10))
      }
    }
    if (minSeq === Number.MAX_SAFE_INTEGER) return

    ss.updateSessionState(sessionId, { isLoadingOlder: true })
    connection.sendSessionHistory(sessionId, {
      before: minSeq,
      limit: 200,
      projectId: conv.projectId,
    })
  },

  updateConversationTitle: (sessionId, title) => {
    set((state) => {
      const conversations = state.conversations.map((c) => {
        if (c.sessionId !== sessionId) return c
        return { ...c, title, updatedAt: Date.now() }
      })
      return { conversations }
    })
  },

  registerPendingSession: (id) => sessionStore.getState().registerPendingSession(id),
  resolvePendingSession: (id) => sessionStore.getState().resolvePendingSession(id),

  resetForDisconnect: () => {
    set({
      _sessionAssistantMsgIds: new Map(),
      _sessionThinkingMsgIds: new Map(),
      _subAgentProgressMsgIds: new Map(),
    })
    sessionStore.getState().reset()
    projectStore.getState().resetTransient()
  },
}))

// ── Wire connection events to store ─────────────────────────────────

connection.onStatusChange((status) => {
  useStore.getState().setConnectionStatus(status)
  sessionStore.getState().setConnectionStatus(status)

  const cs = connectionStore.getState()
  if (status === 'connecting' && cs.initPhase === 'idle') {
    cs.setInitPhase('connecting')
  } else if (status === 'disconnected' || status === 'error') {
    cs.reset()
  }
})

connection.onMessage(handleWsMessage)

// ── Hooks ───────────────────────────────────────────────────────────

export function useConnectionStatus(): ConnectionStatus {
  return useStore((s) => s.connectionStatus)
}

export function useAgentStatus() {
  return sessionStore((store) => {
    const sid = store.currentSessionId
    if (!sid) return 'idle' as const
    const ss = store.sessionStates.get(sid)
    return ss?.status ?? ('idle' as const)
  })
}
