# anton.computer — Connection Spec

> **Spec Version: 0.2.0**
>
> Single source of truth for ports, protocols, and connection behavior.
> All clients (desktop, CLI) and the agent server MUST honor this spec.
>
> Bump this version when protocol or behavior changes. The agent reports
> this version in `auth_ok.specVersion` so clients know what to expect.

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| **9876** | `ws://` | Primary WebSocket (plain, no TLS) |
| **9877** | `wss://` | TLS WebSocket (self-signed or CA cert) |

- The agent server MUST listen on **both** ports simultaneously.
- Port 9876 (plain WS) is the **default** for all clients.
- Port 9877 (TLS) is optional — used when security is required over untrusted networks.
- Both ports use the same binary framing protocol and auth flow.

## Authentication

| Step | Direction | Channel | Message |
|------|-----------|---------|---------|
| 1 | Client → Agent | CONTROL (0x00) | `{ type: "auth", token: "<token>" }` |
| 2a | Agent → Client | CONTROL (0x00) | `{ type: "auth_ok", agentId, version, gitHash, specVersion }` |
| 2b | Agent → Client | CONTROL (0x00) | `{ type: "auth_error", reason }` |

- Token format: `ak_<48 hex chars>` (24 random bytes)
- Auth timeout: 10 seconds — server closes connection if no auth received
- One active client at a time — new connection replaces the old one

## Wire Protocol

Single WebSocket connection, multiplexed into 5 logical channels via binary framing:

```
Frame: [1 byte channel] [N bytes JSON payload]
```

| Channel | ID | Purpose |
|---------|-----|---------|
| CONTROL | 0x00 | Auth, ping/pong, lifecycle, config management |
| TERMINAL | 0x01 | PTY data (base64-encoded) |
| AI | 0x02 | Chat, sessions, providers, tool calls, confirmations |
| FILESYNC | 0x03 | File sync (reserved, v0.3) |
| EVENTS | 0x04 | Status updates, notifications |

## Session Management (v0.2.0)

Sessions are independent agent instances, each with their own model, provider, and message history. Sessions persist to `~/.anton/sessions/` and can be resumed across client reconnects.

### Session Lifecycle

| Step | Direction | Channel | Message |
|------|-----------|---------|---------|
| Create | Client → Agent | AI | `{ type: "session_create", id, provider?, model?, apiKey? }` |
| Created | Agent → Client | AI | `{ type: "session_created", id, provider, model }` |
| Resume | Client → Agent | AI | `{ type: "session_resume", id }` |
| Resumed | Agent → Client | AI | `{ type: "session_resumed", id, provider, model, messageCount, title }` |
| List | Client → Agent | AI | `{ type: "sessions_list" }` |
| List Response | Agent → Client | AI | `{ type: "sessions_list_response", sessions: [...] }` |
| Destroy | Client → Agent | AI | `{ type: "session_destroy", id }` |
| Destroyed | Agent → Client | AI | `{ type: "session_destroyed", id }` |

- Messages without `sessionId` target the "default" session (auto-created)
- `apiKey` in `session_create` overrides the server-stored key for that session only (never persisted)
- Sessions auto-expire after `sessions.ttlDays` (default: 7 days)

### Chat Messages (with session support)

All AI chat messages now accept an optional `sessionId` field:

```typescript
{ type: "message", content: string, sessionId?: string }
{ type: "text", content: string, sessionId?: string }
{ type: "tool_call", id, name, input, sessionId?: string }
{ type: "tool_result", id, output, isError?, sessionId?: string }
{ type: "confirm", id, command, reason, sessionId?: string }
{ type: "confirm_response", id, approved }
{ type: "done", sessionId?: string }
{ type: "error", message, sessionId?: string }
```

## Provider Management (v0.2.0)

Providers are managed via AI channel messages. API keys are stored in `~/.anton/config.yaml`.

| Direction | Channel | Message |
|-----------|---------|---------|
| Client → Agent | AI | `{ type: "providers_list" }` |
| Agent → Client | AI | `{ type: "providers_list_response", providers: [...], defaults }` |
| Client → Agent | AI | `{ type: "provider_set_key", provider, apiKey }` |
| Agent → Client | AI | `{ type: "provider_set_key_response", success, provider }` |
| Client → Agent | AI | `{ type: "provider_set_default", provider, model }` |
| Agent → Client | AI | `{ type: "provider_set_default_response", success, provider, model }` |

Provider list entries:
```typescript
{ name: string, models: string[], hasApiKey: boolean, baseUrl?: string }
```

## Config Management (v0.2.0)

System-level config queries/updates via CONTROL channel:

| Direction | Channel | Message |
|-----------|---------|---------|
| Client → Agent | CONTROL | `{ type: "config_query", key }` |
| Agent → Client | CONTROL | `{ type: "config_query_response", key, value }` |
| Client → Agent | CONTROL | `{ type: "config_update", key, value }` |
| Agent → Client | CONTROL | `{ type: "config_update_response", success, error? }` |

Valid keys: `"providers"`, `"defaults"`, `"security"`

## Client Connection Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Port | 9876 | Plain WS |
| TLS | Off | Self-signed certs cause issues in WebViews |
| Reconnect delay | 3 seconds | Auto-reconnect on disconnect |
| Auth timeout | 10 seconds | Client-side timeout for auth response |

## Firewall / Security Groups

The following ports MUST be open inbound (TCP):

| Port | Required |
|------|----------|
| 9876 | Yes — primary connection |
| 9877 | Yes — TLS fallback |
| 22 | Yes — SSH for deployment |
| 80 | Optional — HTTP for hosted services |
| 443 | Optional — HTTPS for hosted services |

## Agent Server Startup

The agent server starts two listeners:

1. **Plain HTTP + WebSocket** on port from config (default 9876)
2. **HTTPS + WebSocket** on config port + 1 (default 9877) — uses self-signed cert from `~/.anton/certs/`

If cert generation fails, only the plain server starts.

## Config File

Location: `~/.anton/config.yaml`

```yaml
agentId: anton-<hostname>-<random>
token: ak_<48 hex chars>
port: 9876

providers:
  anthropic:
    apiKey: ""
    models:
      - claude-sonnet-4-6
      - claude-opus-4-6
      - claude-haiku-4-5
  openai:
    apiKey: ""
    models:
      - gpt-4o
      - gpt-4o-mini
      - o3
  ollama:
    baseUrl: "http://localhost:11434"
    models:
      - llama3
      - codellama
      - mistral
  google:
    apiKey: ""
    models:
      - gemini-2.5-pro
      - gemini-2.5-flash

defaults:
  provider: anthropic
  model: claude-sonnet-4-6

security:
  confirmPatterns: [...]
  forbiddenPaths: [...]
  networkAllowlist: [...]

sessions:
  ttlDays: 7

skills: []
```

### Legacy Config Migration

If the agent detects a v0.1.0 config (single `ai:` block), it auto-migrates to the multi-provider format:

```yaml
# v0.1.0 (legacy)
ai:
  provider: anthropic
  apiKey: "sk-ant-..."
  model: claude-sonnet-4-6

# → auto-migrated to v0.2.0
providers:
  anthropic:
    apiKey: "sk-ant-..."
    models: [claude-sonnet-4-6, ...]
defaults:
  provider: anthropic
  model: claude-sonnet-4-6
```

## Session Persistence

Location: `~/.anton/sessions/<session-id>.json`

```json
{
  "id": "sess_abc123",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "messages": [],
  "createdAt": 1711036800000,
  "lastActiveAt": 1711036900000,
  "title": "Deploy nginx config"
}
```

- Title is auto-generated from the first user message
- Messages use pi SDK's internal format
- Sessions are cleaned up after `sessions.ttlDays` (default 7 days)

## Backward Compatibility

- v0.2.0 clients work with v0.1.0 agents (session/provider messages will be ignored)
- v0.1.0 clients work with v0.2.0 agents (messages without `sessionId` use "default" session)
- Legacy config auto-migrates on agent startup

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-03-19 | 0.1.0 | Initial spec. Plain WS on 9876 as default, TLS on 9877. |
| 2026-03-19 | 0.2.0 | Multi-provider registry, per-session models, session persistence, config management protocol. |
