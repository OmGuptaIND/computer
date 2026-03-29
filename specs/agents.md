# Agents — Architecture Spec

## Core Idea

An agent is a conversation that runs on a schedule. Nothing more.

Every conversation in Anton already has: message history, tool access, MCP connectors, workspace, memory. An agent adds one thing: a cron schedule that triggers it automatically.

```
~/.anton/projects/{projectId}/conversations/{sessionId}/
├── meta.json          ← every conversation has this
├── messages.jsonl     ← every conversation has this
├── agent.json         ← ONLY present if this conversation is an agent
```

## agent.json

```typescript
interface AgentRunRecord {
  startedAt: number               // When the run began
  completedAt: number | null      // When the run ended (null if still running)
  status: 'success' | 'error' | 'timeout'
  error?: string                  // Error message if failed
  durationMs?: number             // completedAt - startedAt
  trigger: 'cron' | 'manual'     // What triggered this run
}

interface AgentMetadata {
  name: string                    // "Daily Reddit Quotes"
  description: string             // "Finds AI quotes from Reddit"
  instructions: string            // What to do on each run
  schedule?: { cron: string }     // "0 9 * * *" — null means manual-only
  originConversationId?: string   // Parent conversation (for result delivery)
  tokenBudget?: {
    perRun: number
    monthly: number
    usedThisMonth: number
  }
  status: 'idle' | 'running' | 'paused' | 'error'
  lastRunAt: number | null
  nextRunAt: number | null
  runCount: number
  createdAt: number
  runHistory?: AgentRunRecord[]   // Last 20 runs (ring buffer)
}
```

## How It Works

### Creation

1. User in conversation A: "find me AI quotes from Reddit every day"
2. Anton calls `agent` tool → user sees confirmation dialog → approves
3. `AgentManager.createAgent()` creates conversation directory + `agent.json`
4. `originConversationId` set to A (the human's conversation)
5. UI shows new agent card in the Agents tab

### Execution — System Prompt + Short Trigger

Agent instructions live in the **system prompt**, not in user messages. This prevents the agent from re-creating scripts on every run.

1. `AgentManager.tick()` runs every 30s, checks cron schedules
2. When it's time: `runAgent(sessionId, 'cron')` sends a **short trigger message** (not the full instructions)
3. The session is resumed with `agentInstructions` injected into the system prompt via `<agent_instructions>` block
4. The conversation runs, uses tools, writes scripts, produces output
5. On completion: status updated, run record appended to `runHistory`, `agent.json` persisted

Each run is recorded as an `AgentRunRecord` with start/end timestamps, duration, success/error status, error message (if failed), and trigger type (cron vs manual). The history is capped at 20 entries.

**Why system prompt, not user message:** Sending the full instructions as a user message every run makes the LLM think it's a fresh task — it re-writes scripts, re-computes everything, burns tokens, and eventually hits context limits. With instructions in the system prompt, the LLM always knows its mission and can re-use what it built.

### First Run vs Subsequent Runs

**First run:** Trigger message says "This is your first run. Build any scripts or tooling you need." The agent reads its instructions from the system prompt, builds everything, and returns first results.

**Subsequent runs:** Trigger message says "Re-use the scripts and tooling you built in previous runs." The LLM sees its conversation history (what it built), the system prompt (what to do), and a short "go" signal. It re-executes existing scripts instead of rebuilding.

The agent's conversation history persists across runs. It remembers what it built, what the user told it, and what worked.

### Result Delivery

The agent has a `deliver_result` tool. When it has meaningful results, it calls this tool with the content. The server appends the result as a message to the `originConversationId` conversation. The user sees it next time they open that chat.

External delivery (Telegram, email, Slack) is just part of the agent's instructions + MCP access. No special infrastructure needed.

### Flat Ownership

All agents are children of the root human conversation. If agent A creates agent B, B's `originConversationId` points to the original human conversation, not to A. `resolveRootConversation()` walks up the chain.

```
User's conversation
  ├── Agent A (daily reddit)
  ├── Agent B (created by A, but owned by user)
  └── Agent C (also flat)
```

### User Interaction — Conversation-First Model

Clicking an agent in the UI creates a **new project conversation** tagged with that agent's context. The agent is not a single session that gets reopened — each interaction spawns a fresh conversation.

**Flow:**
1. User clicks agent card in ProjectLanding
2. Client creates a new `proj_{projectId}_sess_{timestamp}` session with `agentSessionId` set to the agent's metadata session ID
3. `AgentEmptyState` renders: agent name, description, stats (last run, next run, run count, tokens), expandable instructions, scheduler debug panel (cron expression, status, exact next/last run timestamps), collapsible run history (last 20 runs with status, duration, trigger type, expandable errors), Run/Stop button, and a chat input
4. User types a question → agent context (name, description, instructions) is injected into the first message as `<agent_context>` XML
5. The conversation becomes a normal project conversation with auto-generated title
6. It appears in the sidebar thread list with a Bot icon badge
7. Going back to the project landing and clicking the agent again creates another new conversation

**Why this model:**
- Each conversation with an agent is a distinct interaction the user can reference later
- Agent conversations show alongside regular project threads in the sidebar
- The agent's instructions and context are naturally embedded in the conversation history
- No special session resumption logic needed — it's just a conversation

**When messages exist**, `AgentChatHeader` renders above the message list showing agent status, schedule, and run/stop controls. The breadcrumb shows `Project / AgentName`.

**Background scheduled runs** still use the agent's own `agent--` session ID. Those are separate from user-initiated conversations and are managed by `AgentManager.tick()`.

## Files

| File | Purpose |
|------|---------|
| `packages/protocol/src/projects.ts` | `AgentMetadata`, `AgentSession` types |
| `packages/protocol/src/messages.ts` | Agent protocol messages |
| `packages/agent-config/src/projects.ts` | `loadAgentMetadata()`, `saveAgentMetadata()`, `listProjectAgents()` |
| `packages/agent-server/src/agents/agent-manager.ts` | CRUD + cron scheduler + sendMessage bridge |
| `packages/agent-server/src/agents/cron.ts` | Cron expression parser |
| `packages/agent-server/src/server.ts` | Agent handlers, `buildAgentActionHandler()`, `buildDeliverResultHandler()` |
| `packages/agent-core/src/tools/job.ts` | `AgentToolInput` type, `JobActionHandler` callback |
| `packages/agent-core/src/tools/deliver-result.ts` | `DeliverResultHandler` callback |
| `packages/agent-core/src/agent.ts` | `agent` tool + `deliver_result` tool definitions |
| `packages/desktop/src/components/projects/ProjectLanding.tsx` | Agent cards, `onOpenAgent` callback |
| `packages/desktop/src/components/projects/ProjectView.tsx` | `handleOpenAgent()` creates new conversation per click |
| `packages/desktop/src/components/chat/AgentEmptyState.tsx` | Agent-specific empty state UI |
| `packages/desktop/src/components/chat/AgentChatHeader.tsx` | Inline agent header above messages |
| `packages/desktop/src/components/AgentChat.tsx` | Branches between agent/regular UI, injects agent context |
| `packages/desktop/src/lib/conversations.ts` | `Conversation.agentSessionId` field |
| `packages/desktop/src/lib/store.ts` | `projectAgents: AgentSession[]`, `getActiveAgentSession()` selector |
| `packages/desktop/src/lib/agent-utils.ts` | `cronToHuman()`, `formatRelativeTime()`, `formatDuration()`, `formatAbsoluteTime()` shared helpers |
| `packages/desktop/src/lib/connection.ts` | `sendAgentCreate()`, `sendAgentsList()`, `sendAgentAction()` |
| `packages/agent/prompts/system.md` | Agent execution rules, tool-building instructions |

## Protocol Messages

**Client → Server:**
- `agent_create` — create a new agent
- `agents_list` — list agents in a project
- `agent_action` — start / stop / delete / pause / resume

**Server → Client:**
- `agent_created` — agent was created
- `agents_list_response` — list of agents
- `agent_updated` — agent status changed
- `agent_deleted` — agent was removed
- `agent_result_delivered` — agent sent results to origin conversation

## Session ID Format

Agent sessions use `agent--{projectId}--{suffix}` format. The `--` delimiter makes projectId extraction unambiguous regardless of what characters the projectId contains.

## Confirmation

Agent creation and deletion require user confirmation via `ask_user`. This is enforced at the tool level — the LLM cannot bypass it.

## What Agents Are NOT

- **Not sub-agents.** Sub-agents are ephemeral parallel workers that run for seconds and return results inline. Agents are persistent scheduled conversations.
- **Not shell jobs.** Agents are AI conversations, not process managers. If you need to run a shell command, the agent uses the `shell` tool inside its conversation.
- **Not a separate system.** An agent is a conversation. Same infrastructure, same persistence, same tools. The only difference is `agent.json`.
