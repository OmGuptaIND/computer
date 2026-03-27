# Agents & Jobs System — Spec

## Overview

Agents are autonomous AI workers that Anton spawns, schedules, and monitors. An agent is a managed AI session (or shell process) with full project + MCP connector access that runs independently — on a schedule, on demand, or continuously. Agents enable automation like LinkedIn outreach, data pipelines, Reddit monitoring, and scheduled tasks — replacing $300/seat tools like Starnas.

The key insight: **an agent IS a sub-agent session, but triggered by a scheduler instead of a chat turn.** The same sub-agent infrastructure (MCP connectors, project files, tool access, sub-agent spawning) powers both interactive sub-agents and autonomous scheduled agents.

## Architecture

```
User (in chat) ──► Main Agent ──► creates agent (job)
                                      │
                                      ▼
                               JobManager stores it
                                      │
                               ┌──────┴──────┐
                               │  Scheduler   │
                               │  (30s tick)  │
                               └──────┬──────┘
                                      │ fires at cron time
                                      ▼
                               Agent Session spawns
                               (full project + MCP powers)
                                      │
                               ┌──────┴──────┐
                               │ Can spawn    │
                               │ sub-agents   │
                               │ in parallel  │
                               └──────┬──────┘
                                      │
                                      ▼
                               Results → logs, notifications,
                               project memory, MCP actions
```

## Agent Types (JobKind)

### Task (`kind: 'task'`)
Shell process. Run once, produce output, exit. Re-runnable.
- Example: `python export_data.py`

### Agent (`kind: 'agent'`)
AI session with a prompt. Gets full tool access (filesystem, shell, browser, MCP connectors). Can spawn sub-agents. Persists session across runs for context continuity.
- Example: "Find top 5 Reddit quotes and push to Airtable"
- Default timeout: 600s (10 min)
- Default token budget: 100k per run

### Long-Running (`kind: 'long-running'`)
Shell process that stays alive. Has restart policy for crash recovery.
- Example: WebSocket monitor, file watcher

## Sub-Agent Powers

Sub-agents (spawned by main agent or by agent jobs) have full capabilities:

- **MCP connectors** — same connectors as the project (LinkedIn, Reddit, Airtable, etc.)
- **Project scope** — projectId, workspace directory, project files
- **Job management** — can create/start/stop other agents
- **Shared memory** — project-scoped via `conversationId: 'project-{id}'`
- **Sub-agent spawning** — up to 2 levels of nesting (sub-agents can spawn sub-sub-agents)
- **Safety limits** — 100k token budget, 10 min timeout, 50 max turns per sub-agent

## MCP Concurrency

MCP requests are serialized per connector via a request queue in `McpClient`. Only one request is in-flight per MCP server process at a time, preventing race conditions in non-thread-safe MCP servers. Responses are matched by JSON-RPC ID.

## Session Model

Each agent has its **own persistent session** that builds context over time:
- Run 1: Fresh session → does work → session persisted
- Run 2: Resume session → has memory of Run 1 → does work → persisted
- Compaction automatically manages context window as it grows

Plus **project context** injected into the system prompt (shared across all agents).
Plus **project memory** via the memory tool (shared, persistent key-value store).

## Token Budget

Each agent tracks token usage:
- `tokenBudgetPerRun` — max tokens per run (default 100k for agents, enforced by Session)
- `tokenBudgetMonthly` — max tokens per month (0 = unlimited)
- `tokensUsedThisMonth` — running total
- `tokensUsedLastRun` — last run's consumption

Enforcement: Session's `maxTokenBudget` aborts the agent if exceeded mid-run.

## WebSocket Resilience

Sub-agent sessions (`sub_*`) and agent job sessions (`agent-job-*`) survive WebSocket disconnects. They continue running in the background and persist their results. Only interactive parent sessions are cancelled on disconnect.

## MCP Health & Auto-Reconnect

- `McpClient.ping()` — 5s health check
- Auto-reconnect on disconnect (5s delay)
- Optional periodic health check loop (60s interval)

## Progress Streaming

Sub-agents emit `sub_agent_progress` events with live text output. The parent agent and UI can see what a sub-agent is doing in real-time. Displayed in the `SubAgentGroup` component as expandable pills with "Agent" label, task description, and tool call summary.

## Storage

```
~/.anton/projects/{projectId}/
├── jobs/{jobId}/
│   ├── job.json              # Agent definition and state
│   └── runs/
│       ├── {runId}.log       # stdout/stderr or session event log
│       └── {runId}.json      # Run metadata (start, end, exit code, tokens)
├── conversations/
│   ├── agent-job-{projectId}-{jobId}/  # Agent session (persistent)
│   └── proj_{projectId}_sess_{id}/     # User sessions
├── notifications/
│   └── feed.jsonl            # Notification history
└── memory/                   # Shared project memory
```

## Protocol Messages

### Client → Server (AI Channel)
| Message | Purpose |
|---------|---------|
| `job_create` | Create a new agent/job |
| `jobs_list` | List all agents for a project |
| `job_action` | Start, stop, or delete an agent |
| `job_logs` | Get log lines for a run |

### Server → Client (AI Channel)
| Message | Purpose |
|---------|---------|
| `job_created` | Agent was created |
| `jobs_list_response` | List of agents |
| `job_updated` | Agent state changed |
| `job_deleted` | Agent was removed |
| `job_logs_response` | Log lines |

### Server → Client (Events Channel)
| Message | Purpose |
|---------|---------|
| `job_event` | Real-time: started, completed, failed, crashed, stopped |
| `notification` | Persistent notification |

## Agent Tool

The `job` tool is available in project-scoped sessions. Operations:

| Operation | Description |
|-----------|-------------|
| `create` | Create agent (name, kind, command/prompt, schedule) |
| `list` | Show all agents in the project |
| `start` | Start an agent by ID |
| `stop` | Stop a running agent |
| `delete` | Remove an agent |
| `logs` | View recent output |
| `status` | Check detailed status |

## Desktop UI

### Project Landing — Tabbed View
Main area has two tabs:
- **Sessions** — user conversations (existing pattern)
- **Agents** — autonomous agent cards with rich metadata

### Agent Session Card
Shows: status dot, bot icon, name, description, metadata pills (schedule in human-readable form, tokens used, last run status, run count), token budget bar, Run/Stop/Delete buttons.

### Right Config Panel (settings only)
- Instructions
- Files
- Memory

Agents and Notifications removed from config panel — they're live content, not settings.

### Sub-Agent Activity (in chat)
Collapsible pill: `▸ ● Agent  [task description]` with tool summary line underneath. Expandable to show full tool call tree. Live progress text streamed via `sub_agent_progress` events.

## Runner Extensibility

The `JobRunner` interface is the extensibility point for shell jobs:

```typescript
interface JobRunner {
  readonly name: string  // 'local' | 'modal' | 'daytona'
  start(options: JobRunnerOptions): JobRunHandle
  isAvailable(): Promise<boolean>
}
```

Agent jobs use the Session system directly (not JobRunner).

## Timeout Defaults

| Kind | Default Timeout | Rationale |
|------|----------------|-----------|
| `task` | 300s (5 min) | Shell tasks should complete quickly |
| `agent` | 600s (10 min) | AI sessions are heavier but finite |
| `long-running` | 0 (unlimited) | Intentionally long-lived |

## Files

### New files
- `packages/agent-server/src/jobs/cron.ts` — Shared cron parser
- `packages/agent-server/src/jobs/runner.ts` — JobRunner interface
- `packages/agent-server/src/jobs/local-runner.ts` — Local process runner
- `packages/agent-server/src/jobs/manager.ts` — JobManager (CRUD, lifecycle, scheduling, agent sessions)
- `packages/agent-server/src/jobs/notifications.ts` — JSONL notification persistence
- `packages/agent-server/src/jobs/index.ts` — Barrel export
- `packages/agent-core/src/tools/job.ts` — Agent job tool types
- `packages/desktop/src/components/projects/ProjectAgents.tsx` — Agent cards + config panel section
- `packages/desktop/src/components/projects/AgentDetailPanel.tsx` — Run history (planned)

### Modified files
- `packages/protocol/src/projects.ts` — Job/Agent types (JobKind, token budget fields)
- `packages/protocol/src/messages.ts` — Job messages, progress events
- `packages/agent-core/src/agent.ts` — Sub-agent powers, depth control, progress streaming, job tool
- `packages/agent-core/src/session.ts` — Token budget, timeout, max turns enforcement
- `packages/agent-core/src/mcp/mcp-client.ts` — Request queue, ping health check
- `packages/agent-core/src/mcp/mcp-manager.ts` — Auto-reconnect, health check loop
- `packages/agent-server/src/server.ts` — Job handlers, WebSocket resilience, session filtering
- `packages/agent-server/src/index.ts` — JobManager initialization
- `packages/agent-server/src/scheduler.ts` — Shared cron import
- `packages/desktop/src/lib/store.ts` — Agent state (renamed from jobs)
- `packages/desktop/src/lib/connection.ts` — Agent sender methods
- `packages/desktop/src/components/projects/ProjectLanding.tsx` — Sessions/Agents tabs
- `packages/desktop/src/components/projects/ProjectConfigPanel.tsx` — Removed Agents/Notifications sections
- `packages/desktop/src/components/chat/SubAgentGroup.tsx` — Agent label + progress display
- `packages/desktop/src/index.css` — Agent card, tab bar, sub-agent styles

## Future Considerations

- **Connector marketplace** — Pre-built MCP connectors for LinkedIn, Reddit, Airtable, etc.
- **Agent templates** — Pre-built prompt + schedule + connector bundles
- **Live session view** — Click an agent run to see its full session (tool calls, reasoning)
- **Notification system** — Badge/dropdown pattern instead of panel section
- **UI redesign** — Collapsible right panel, stronger visual hierarchy, simplified input area
- **Agent-to-agent communication** — Agents triggering other agents based on results
- **Remote execution** — Modal/Daytona runners for sandboxed agent execution
