/**
 * Shared types for mobile stores — mirrors desktop types.
 */

import type { AiMessage, AskUserQuestion, TaskItem, TokenUsage } from '@anton/protocol'

export type AgentStatus = 'idle' | 'working' | 'error'

export interface RoutineStep {
  id: string
  type: 'tool_call' | 'tool_result'
  label: string
  toolName?: string
  status: 'active' | 'complete' | 'error'
  timestamp: number
}

export interface SessionMeta {
  id: string
  title: string
  provider: string
  model: string
  messageCount: number
  createdAt: number
  lastActiveAt: number
  status?: string
}

export interface ProviderInfo {
  name: string
  models: string[]
  defaultModels?: string[]
  hasApiKey: boolean
  baseUrl?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp: number
  toolName?: string
  toolInput?: Record<string, unknown>
  isError?: boolean
  isThinking?: boolean
  parentToolCallId?: string
  isSteering?: boolean
  askUserAnswers?: Record<string, string>
  attachments?: ChatImageAttachment[]
}

export interface ChatImageAttachment {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  data?: string
  storagePath?: string
}

export interface Conversation {
  id: string
  sessionId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  provider?: string
  model?: string
  projectId?: string
  agentSessionId?: string
  pendingCreation?: boolean
}

export interface PendingConfirm {
  id: string
  command: string
  reason: string
  sessionId?: string
}

export interface PendingPlan {
  id: string
  title: string
  content: string
  sessionId?: string
}

export interface PendingAskUser {
  id: string
  questions: AskUserQuestion[]
  sessionId?: string
}

export interface SessionState {
  status: AgentStatus
  statusDetail: string | null
  isStreaming: boolean
  tasks: TaskItem[]
  agentSteps: RoutineStep[]
  workingStartedAt: number | null
  lastTurnDurationMs: number | null
  turnUsage: TokenUsage | null
  sessionUsage: TokenUsage | null
  lastResponseProvider: string | null
  lastResponseModel: string | null
  pendingConfirm: PendingConfirm | null
  pendingPlan: PendingPlan | null
  pendingAskUser: PendingAskUser | null
  hiddenToolCallIds: Set<string>
  toolCallNames: Map<string, { name: string; input?: Record<string, unknown> }>
  needsHistoryRefresh: boolean
  isSyncing: boolean
  pendingSyncMessages: AiMessage[]
  hasMore: boolean
  isLoadingOlder: boolean
  assistantMsgId: string | null
  resolver?: () => void
}

export function createSessionState(partial?: Partial<SessionState>): SessionState {
  return {
    status: 'idle',
    statusDetail: null,
    isStreaming: false,
    tasks: [],
    agentSteps: [],
    workingStartedAt: null,
    lastTurnDurationMs: null,
    turnUsage: null,
    sessionUsage: null,
    lastResponseProvider: null,
    lastResponseModel: null,
    pendingConfirm: null,
    pendingPlan: null,
    pendingAskUser: null,
    hiddenToolCallIds: new Set(),
    toolCallNames: new Map(),
    needsHistoryRefresh: false,
    isSyncing: false,
    pendingSyncMessages: [],
    hasMore: true,
    isLoadingOlder: false,
    assistantMsgId: null,
    ...partial,
  }
}

export interface CitationSource {
  index: number
  title: string
  url: string
  domain: string
}
