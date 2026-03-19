// ── Control Channel (0x00) ──────────────────────────────────────────

export interface AuthMessage {
  type: "auth";
  token: string;
}

export interface AuthOkMessage {
  type: "auth_ok";
  agentId: string;
  version: string;
  gitHash: string;
  specVersion: string;
}

export interface AuthErrorMessage {
  type: "auth_error";
  reason: string;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export interface ConfigQueryMessage {
  type: "config_query";
  key: "providers" | "defaults" | "security";
}

export interface ConfigQueryResponse {
  type: "config_query_response";
  key: string;
  value: unknown;
}

export interface ConfigUpdateMessage {
  type: "config_update";
  key: string;
  value: unknown;
}

export interface ConfigUpdateResponse {
  type: "config_update_response";
  success: boolean;
  error?: string;
}

export type ControlMessage =
  | AuthMessage
  | AuthOkMessage
  | AuthErrorMessage
  | PingMessage
  | PongMessage
  | ConfigQueryMessage
  | ConfigQueryResponse
  | ConfigUpdateMessage
  | ConfigUpdateResponse;

// ── Terminal Channel (0x01) ─────────────────────────────────────────

export interface PtySpawnMessage {
  type: "pty_spawn";
  id: string;
  cols: number;
  rows: number;
  shell?: string;
}

export interface PtyResizeMessage {
  type: "pty_resize";
  id: string;
  cols: number;
  rows: number;
}

export interface PtyCloseMessage {
  type: "pty_close";
  id: string;
}

export interface PtyDataMessage {
  type: "pty_data";
  id: string;
  data: string; // base64 for binary safety over JSON
}

export type TerminalMessage =
  | PtySpawnMessage
  | PtyResizeMessage
  | PtyCloseMessage
  | PtyDataMessage;

// ── AI Channel (0x02) ───────────────────────────────────────────────

// Session management
export interface SessionCreateMessage {
  type: "session_create";
  id: string;
  provider?: string;
  model?: string;
  apiKey?: string;      // client-provided key override (not persisted)
}

export interface SessionCreatedMessage {
  type: "session_created";
  id: string;
  provider: string;
  model: string;
}

export interface SessionResumeMessage {
  type: "session_resume";
  id: string;
}

export interface SessionResumedMessage {
  type: "session_resumed";
  id: string;
  provider: string;
  model: string;
  messageCount: number;
  title: string;
}

export interface SessionsListMessage {
  type: "sessions_list";
}

export interface SessionsListResponse {
  type: "sessions_list_response";
  sessions: {
    id: string;
    title: string;
    provider: string;
    model: string;
    messageCount: number;
    createdAt: number;
    lastActiveAt: number;
  }[];
}

export interface SessionDestroyMessage {
  type: "session_destroy";
  id: string;
}

export interface SessionDestroyedMessage {
  type: "session_destroyed";
  id: string;
}

// Provider management
export interface ProvidersListMessage {
  type: "providers_list";
}

export interface ProvidersListResponse {
  type: "providers_list_response";
  providers: {
    name: string;
    models: string[];
    hasApiKey: boolean;
    baseUrl?: string;
  }[];
  defaults: { provider: string; model: string };
}

export interface ProviderSetKeyMessage {
  type: "provider_set_key";
  provider: string;
  apiKey: string;
}

export interface ProviderSetKeyResponse {
  type: "provider_set_key_response";
  success: boolean;
  provider: string;
}

export interface ProviderSetDefaultMessage {
  type: "provider_set_default";
  provider: string;
  model: string;
}

export interface ProviderSetDefaultResponse {
  type: "provider_set_default_response";
  success: boolean;
  provider: string;
  model: string;
}

// Chat messages
export interface AiUserMessage {
  type: "message";
  content: string;
  sessionId?: string;   // target session (defaults to "default")
}

export interface AiThinkingMessage {
  type: "thinking";
  text: string;
  sessionId?: string;
}

export interface AiTextMessage {
  type: "text";
  content: string;
  sessionId?: string;
}

export interface AiToolCallMessage {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
  sessionId?: string;
}

export interface AiToolResultMessage {
  type: "tool_result";
  id: string;
  output: string;
  isError?: boolean;
  sessionId?: string;
}

export interface AiConfirmMessage {
  type: "confirm";
  id: string;
  command: string;
  reason: string;
  sessionId?: string;
}

export interface AiConfirmResponseMessage {
  type: "confirm_response";
  id: string;
  approved: boolean;
}

export interface AiDoneMessage {
  type: "done";
  sessionId?: string;
}

export interface AiErrorMessage {
  type: "error";
  message: string;
  sessionId?: string;
}

export type AiMessage =
  // Session management
  | SessionCreateMessage
  | SessionCreatedMessage
  | SessionResumeMessage
  | SessionResumedMessage
  | SessionsListMessage
  | SessionsListResponse
  | SessionDestroyMessage
  | SessionDestroyedMessage
  // Provider management
  | ProvidersListMessage
  | ProvidersListResponse
  | ProviderSetKeyMessage
  | ProviderSetKeyResponse
  | ProviderSetDefaultMessage
  | ProviderSetDefaultResponse
  // Chat
  | AiUserMessage
  | AiThinkingMessage
  | AiTextMessage
  | AiToolCallMessage
  | AiToolResultMessage
  | AiConfirmMessage
  | AiConfirmResponseMessage
  | AiDoneMessage
  | AiErrorMessage;

// ── Event Channel (0x04) ────────────────────────────────────────────

export interface FileChangedEvent {
  type: "file_changed";
  path: string;
  change: "created" | "modified" | "deleted" | "renamed";
}

export interface PortChangedEvent {
  type: "port_changed";
  port: number;
  status: "opened" | "closed";
  process?: string;
}

export interface TaskCompletedEvent {
  type: "task_completed";
  summary: string;
}

export interface AgentStatusEvent {
  type: "agent_status";
  status: "idle" | "working" | "error";
  detail?: string;
}

export type EventMessage =
  | FileChangedEvent
  | PortChangedEvent
  | TaskCompletedEvent
  | AgentStatusEvent;
