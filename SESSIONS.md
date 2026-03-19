# Anton — Session Persistence Spec

> How anton stores conversations, manages history, and handles session lifecycle on the agent VM.
> Inspired by Claude Code's project-scoped sessions and ChatGPT's conversation model.

## Storage Layout

```
~/.anton/
├── sessions/
│   ├── index.json                    # lightweight index of all sessions
│   └── data/
│       ├── sess_abc123/
│       │   ├── meta.json             # session metadata (no messages)
│       │   ├── messages.jsonl        # append-only message log
│       │   └── summary.md           # auto-generated conversation summary
│       ├── sess_def456/
│       │   ├── meta.json
│       │   ├── messages.jsonl
│       │   └── summary.md
│       └── ...
```

### Why this structure

- **index.json** — Fast listing without reading every session. Contains only metadata (id, title, provider, model, timestamps, message count). The TUI and desktop app read this to show session history instantly.
- **meta.json** — Per-session metadata. Separated from messages so metadata updates (title, lastActiveAt) don't rewrite the entire message log.
- **messages.jsonl** — Append-only (one JSON object per line). New messages are appended, never rewritten. This scales to long conversations without read-modify-write cycles. JSONL is standard and streamable.
- **summary.md** — Auto-generated summary of the conversation. Used for session search, context injection, and the session list UI. Updated periodically (every N turns or on session close).

## index.json

Lightweight index for fast listing. Rebuilt from `data/*/meta.json` if corrupted or missing.

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "sess_abc123",
      "title": "Deploy nginx with SSL",
      "provider": "openrouter",
      "model": "minimax/minimax-m2.5",
      "messageCount": 24,
      "createdAt": 1711036800000,
      "lastActiveAt": 1711038600000,
      "archived": false
    }
  ]
}
```

## meta.json

Full session metadata. Source of truth for session state.

```json
{
  "id": "sess_abc123",
  "title": "Deploy nginx with SSL",
  "provider": "openrouter",
  "model": "minimax/minimax-m2.5",
  "createdAt": 1711036800000,
  "lastActiveAt": 1711038600000,
  "messageCount": 24,
  "tokenUsage": {
    "input": 12450,
    "output": 8320,
    "total": 20770
  },
  "archived": false,
  "tags": [],
  "parentSessionId": null
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID, format: `sess_<base36_timestamp>` |
| title | string | Auto-generated from first user message, can be renamed |
| provider | string | AI provider used (e.g., "openrouter", "anthropic") |
| model | string | Model ID (e.g., "minimax/minimax-m2.5") |
| createdAt | number | Unix timestamp (ms) |
| lastActiveAt | number | Updated on every message |
| messageCount | number | Total messages (user + assistant + tool) |
| tokenUsage | object | Cumulative token usage (if tracked by provider) |
| archived | boolean | Soft-delete: hidden from default list, still on disk |
| tags | string[] | User-applied tags for organization |
| parentSessionId | string? | If branched from another session |

## messages.jsonl

Append-only message log. Each line is a self-contained JSON object.

```jsonl
{"seq":1,"role":"user","content":"deploy nginx with ssl on this server","ts":1711036800000}
{"seq":2,"role":"assistant","content":"I'll set up nginx with Let's Encrypt SSL. Let me start by checking the OS and installing nginx.","ts":1711036802000}
{"seq":3,"role":"tool_call","name":"shell","input":{"command":"cat /etc/os-release"},"id":"tc_1","ts":1711036802500}
{"seq":4,"role":"tool_result","id":"tc_1","output":"NAME=\"Ubuntu\"\nVERSION=\"22.04.3 LTS\"","ts":1711036803000}
{"seq":5,"role":"tool_call","name":"shell","input":{"command":"apt-get install -y nginx certbot python3-certbot-nginx"},"id":"tc_2","ts":1711036803500}
{"seq":6,"role":"tool_result","id":"tc_2","output":"Reading package lists... Done\n...","ts":1711036815000}
{"seq":7,"role":"assistant","content":"Nginx is installed and running. Now let me set up SSL with certbot.","ts":1711036816000}
```

### Message format

| Field | Type | Description |
|-------|------|-------------|
| seq | number | Monotonically increasing sequence number |
| role | string | "user", "assistant", "tool_call", "tool_result", "system" |
| content | string | Message text |
| name | string? | Tool name (for tool_call) |
| input | object? | Tool input (for tool_call) |
| id | string? | Tool call ID (links tool_call to tool_result) |
| output | string? | Tool output (for tool_result) |
| isError | boolean? | Whether tool result is an error |
| ts | number | Unix timestamp (ms) |
| usage | object? | Token usage for this specific LLM call |

### Why JSONL

- **Append-only**: New messages = `appendFileSync`. No read-modify-write.
- **Streamable**: Can read line-by-line without loading full file into memory.
- **Recoverable**: Corrupt last line? Skip it. Rest of history is fine.
- **Standard**: Works with `jq`, `grep`, any JSON tooling.
- **No serialization overhead**: Each line is independent. No array brackets to manage.

## summary.md

Auto-generated plain-text summary of the conversation. Updated every 10 turns or on explicit request.

```markdown
# Deploy nginx with SSL

## What was done
- Installed nginx on Ubuntu 22.04
- Configured Let's Encrypt SSL via certbot
- Set up auto-renewal cron job
- Tested HTTPS endpoint

## Key decisions
- Used certbot nginx plugin (not standalone)
- Configured HTTP→HTTPS redirect

## Current state
- Nginx running on ports 80/443
- SSL cert valid until 2026-06-17
- Auto-renewal scheduled
```

### How summaries are generated

1. After every 10 message turns, the agent generates a summary using the LLM
2. Summary is stored as plain markdown — human-readable and searchable
3. Used for:
   - Session list previews in TUI
   - Context injection when resuming old sessions (avoids replaying full history)
   - Search across sessions (`grep` over `summary.md` files)

## Session Lifecycle

### Create
```
1. Generate ID: sess_<Date.now().toString(36)>
2. Create directory: ~/.anton/sessions/data/<id>/
3. Write meta.json with initial metadata
4. Create empty messages.jsonl
5. Update index.json
```

### Message
```
1. Append message line to messages.jsonl
2. Update meta.json (lastActiveAt, messageCount)
3. Update index.json entry
4. Every 10 turns: regenerate summary.md
```

### Resume
```
1. Read meta.json for provider/model info
2. Read messages.jsonl to restore pi SDK message history
3. Optionally: if messages > 100, use summary.md + last 50 messages
   instead of full history (context window management)
```

### Archive (soft delete)
```
1. Set archived: true in meta.json
2. Update index.json
3. Session data stays on disk (can be unarchived)
```

### Delete (hard delete)
```
1. Remove directory: ~/.anton/sessions/data/<id>/
2. Remove from index.json
```

### Auto-cleanup
```
On agent startup:
1. Read index.json
2. Archive sessions older than sessions.ttlDays (default: 30)
3. Delete sessions archived for > 7 days
4. Rebuild index.json from data/*/meta.json if index is stale
```

## Context Window Management

When resuming a session with many messages, loading the full history may exceed the model's context window. Strategy:

1. **< 50 messages**: Load all messages into pi SDK
2. **50-200 messages**: Load summary.md as a system message + last 50 messages
3. **> 200 messages**: Load summary.md + last 30 messages + use `transformContext` hook to prune further

This mirrors how Claude Code handles long sessions — it compacts early history into a summary and keeps recent context intact.

## Session Branching (future)

Like ChatGPT's "edit and regenerate":

```
1. User wants to branch from message seq:15
2. Create new session with parentSessionId = original
3. Copy messages.jsonl lines 1-15 to new session
4. New session continues independently
5. Original session unchanged
```

## Wire Protocol (session listing)

The `sessions_list_response` returns data from `index.json`:

```typescript
{
  type: "sessions_list_response",
  sessions: [{
    id: "sess_abc123",
    title: "Deploy nginx with SSL",
    provider: "openrouter",
    model: "minimax/minimax-m2.5",
    messageCount: 24,
    createdAt: 1711036800000,
    lastActiveAt: 1711038600000,
  }]
}
```

No message content is sent over the wire for listing — only metadata. Full messages are loaded server-side when a session is resumed.

## Search (future)

```
anton sessions search "nginx ssl"
```

Searches across:
1. Session titles (index.json)
2. Summary files (summary.md)
3. Message content (messages.jsonl via grep)

Results ranked by relevance and recency.
