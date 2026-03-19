import { Channel, type TokenUsage } from '@anton/protocol'
import { create } from 'zustand'
import { type ConnectionStatus, connection } from './connection.js'
import {
  type Conversation,
  autoTitle,
  createConversation,
  loadConversations,
  saveConversations,
} from './conversations.js'

// ── Types ───────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  isError?: boolean
}

export interface ProviderInfo {
  name: string
  models: string[]
  hasApiKey: boolean
  baseUrl?: string
}

export interface SessionMeta {
  id: string
  title: string
  provider: string
  model: string
  messageCount: number
  createdAt: number
  lastActiveAt: number
}

export interface SavedMachine {
  id: string
  name: string
  host: string
  port: number
  token: string
  useTLS: boolean
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'unknown'
export type SidebarTab = 'history' | 'skills'

// ── Saved machines (localStorage) ───────────────────────────────────

const MACHINES_KEY = 'anton.machines'

export function loadMachines(): SavedMachine[] {
  try {
    const raw = localStorage.getItem(MACHINES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveMachines(machines: SavedMachine[]) {
  localStorage.setItem(MACHINES_KEY, JSON.stringify(machines))
}

// ── Store ───────────────────────────────────────────────────────────

interface AppState {
  // Connection
  connectionStatus: ConnectionStatus
  agentStatus: AgentStatus

  // Sessions (server-side)
  currentSessionId: string | null
  currentProvider: string
  currentModel: string
  sessions: SessionMeta[]
  providers: ProviderInfo[]
  defaults: { provider: string; model: string }

  // Conversations (client-side, linked to sessions)
  conversations: Conversation[]
  activeConversationId: string | null

  // UI
  sidebarTab: SidebarTab
  searchQuery: string

  // Token usage
  turnUsage: TokenUsage | null
  sessionUsage: TokenUsage | null

  // Pending confirmation
  pendingConfirm: { id: string; command: string; reason: string } | null

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void
  setAgentStatus: (status: AgentStatus) => void
  setSidebarTab: (tab: SidebarTab) => void
  setSearchQuery: (query: string) => void

  // Session actions
  setCurrentSession: (id: string, provider: string, model: string) => void
  setSessions: (sessions: SessionMeta[]) => void
  setProviders: (providers: ProviderInfo[], defaults: { provider: string; model: string }) => void

  // Conversation actions
  newConversation: (title?: string, sessionId?: string) => string
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  addMessage: (msg: ChatMessage) => void
  appendAssistantText: (content: string) => void
  getActiveConversation: () => Conversation | null
  findConversationBySession: (sessionId: string) => Conversation | undefined
  loadSessionMessages: (sessionId: string, messages: ChatMessage[]) => void

  // Usage actions
  setUsage: (turn: TokenUsage | null, session: TokenUsage | null) => void

  // Confirm actions
  setPendingConfirm: (confirm: { id: string; command: string; reason: string } | null) => void
}

export const useStore = create<AppState>((set, get) => {
  // Load persisted conversations
  const persisted = loadConversations()

  return {
    connectionStatus: 'disconnected',
    agentStatus: 'unknown',
    currentSessionId: null,
    currentProvider: 'anthropic',
    currentModel: 'claude-sonnet-4-6',
    sessions: [],
    providers: [],
    defaults: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    conversations: persisted,
    activeConversationId: null,
    sidebarTab: 'history',
    searchQuery: '',
    turnUsage: null,
    sessionUsage: null,
    pendingConfirm: null,

    setConnectionStatus: (status) => set({ connectionStatus: status }),
    setAgentStatus: (status) => set({ agentStatus: status }),
    setSidebarTab: (tab) => set({ sidebarTab: tab }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    setCurrentSession: (id, provider, model) =>
      set({ currentSessionId: id, currentProvider: provider, currentModel: model }),

    setSessions: (sessions) => set({ sessions }),

    setProviders: (providers, defaults) =>
      set({
        providers,
        defaults,
        currentProvider: defaults.provider,
        currentModel: defaults.model,
      }),

    newConversation: (title, sessionId) => {
      const conv = createConversation(title, sessionId)
      set((state) => {
        const conversations = [conv, ...state.conversations]
        saveConversations(conversations)
        return { conversations, activeConversationId: conv.id }
      })
      return conv.id
    },

    switchConversation: (id) => set({ activeConversationId: id }),

    deleteConversation: (id) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id)
        saveConversations(conversations)
        const activeConversationId =
          state.activeConversationId === id
            ? conversations[0]?.id || null
            : state.activeConversationId
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
          const title =
            c.messages.length === 0 && msg.role === 'user' ? autoTitle(messages) : c.title
          return { ...c, messages, title, updatedAt: Date.now() }
        })

        saveConversations(conversations)
        return { conversations }
      })
    },

    appendAssistantText: (content) => {
      set((state) => {
        const activeId = state.activeConversationId
        if (!activeId) return state

        const conversations = state.conversations.map((c) => {
          if (c.id !== activeId) return c
          const messages = [...c.messages]
          const last = messages[messages.length - 1]
          if (last && last.role === 'assistant') {
            messages[messages.length - 1] = { ...last, content: last.content + content }
          } else {
            messages.push({
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content,
              timestamp: Date.now(),
            })
          }
          return { ...c, messages, updatedAt: Date.now() }
        })

        saveConversations(conversations)
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

    loadSessionMessages: (sessionId, messages) => {
      set((state) => {
        const conversations = state.conversations.map((c) => {
          if (c.sessionId !== sessionId) return c
          return { ...c, messages, updatedAt: Date.now() }
        })
        saveConversations(conversations)
        return { conversations }
      })
    },

    setUsage: (turn, session) => set({ turnUsage: turn, sessionUsage: session }),

    setPendingConfirm: (confirm) => set({ pendingConfirm: confirm }),
  }
})

// ── Wire connection events to store ─────────────────────────────────

connection.onStatusChange((status) => {
  useStore.getState().setConnectionStatus(status)
})

connection.onMessage((channel, msg) => {
  const store = useStore.getState()

  if (channel === Channel.EVENTS && msg.type === 'agent_status') {
    store.setAgentStatus(msg.status)
    return
  }

  if (channel !== Channel.AI) return

  switch (msg.type) {
    // ── Chat messages ──────────────────────────────────────────
    case 'text':
      store.appendAssistantText(msg.content)
      break

    case 'thinking':
      store.addMessage({
        id: `think_${Date.now()}`,
        role: 'system',
        content: msg.text,
        timestamp: Date.now(),
      })
      store.setAgentStatus('working')
      break

    case 'tool_call':
      store.addMessage({
        id: `tc_${msg.id}`,
        role: 'tool',
        content: `Running: ${msg.name}`,
        toolName: msg.name,
        toolInput: msg.input,
        timestamp: Date.now(),
      })
      store.setAgentStatus('working')
      break

    case 'tool_result':
      store.addMessage({
        id: `tr_${msg.id}`,
        role: 'tool',
        content: msg.output,
        isError: msg.isError,
        timestamp: Date.now(),
      })
      break

    case 'confirm':
      store.setPendingConfirm({
        id: msg.id,
        command: msg.command,
        reason: msg.reason,
      })
      break

    case 'error':
      store.addMessage({
        id: `err_${Date.now()}`,
        role: 'system',
        content: msg.message,
        isError: true,
        timestamp: Date.now(),
      })
      store.setAgentStatus('error')
      break

    case 'done':
      store.setAgentStatus('idle')
      if (msg.usage) {
        store.setUsage(msg.usage, msg.cumulativeUsage || null)
      }
      break

    // ── Session responses ──────────────────────────────────────
    case 'session_created':
      store.setCurrentSession(msg.id, msg.provider, msg.model)
      break

    case 'session_resumed':
      store.setCurrentSession(msg.id, msg.provider, msg.model)
      break

    case 'sessions_list_response':
      store.setSessions(msg.sessions)
      break

    case 'session_history_response': {
      // Convert server history entries to ChatMessage format
      type HistoryEntry = {
        seq: number
        role: string
        content: string
        ts: number
        toolName?: string
        toolInput?: Record<string, unknown>
        isError?: boolean
      }
      const historyMessages: ChatMessage[] = msg.messages.map((entry: HistoryEntry) => ({
        id: `hist_${entry.seq}_${Date.now()}`,
        role:
          entry.role === 'user'
            ? 'user'
            : entry.role === 'assistant'
              ? 'assistant'
              : entry.role === 'tool_call' || entry.role === 'tool_result'
                ? 'tool'
                : 'system',
        content: entry.content,
        timestamp: entry.ts,
        toolName: entry.toolName,
        toolInput: entry.toolInput,
        isError: entry.isError,
      }))
      store.loadSessionMessages(msg.id, historyMessages)
      break
    }

    case 'session_destroyed':
      store.setSessions(store.sessions.filter((s: SessionMeta) => s.id !== msg.id))
      break

    // ── Provider responses ─────────────────────────────────────
    case 'providers_list_response':
      store.setProviders(msg.providers, msg.defaults)
      break

    case 'provider_set_key_response':
      if (msg.success) connection.sendProvidersList()
      break

    case 'provider_set_default_response':
      if (msg.success) {
        store.setCurrentSession(store.currentSessionId || '', msg.provider, msg.model)
      }
      break

    // ── Compaction ──────────────────────────────────────────────
    case 'compaction_start':
      store.addMessage({
        id: `compact_${Date.now()}`,
        role: 'system',
        content: 'Compacting context...',
        timestamp: Date.now(),
      })
      break

    case 'compaction_complete':
      store.addMessage({
        id: `compact_done_${Date.now()}`,
        role: 'system',
        content: `Context compacted: ${msg.compactedMessages} messages summarized (compaction #${msg.totalCompactions})`,
        timestamp: Date.now(),
      })
      break
  }
})

// ── Convenience hooks ───────────────────────────────────────────────

export function useConnectionStatus(): ConnectionStatus {
  return useStore((s) => s.connectionStatus)
}

export function useAgentStatus(): AgentStatus {
  return useStore((s) => s.agentStatus)
}
