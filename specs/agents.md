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
}
```

## How It Works

### Creation

1. User in conversation A: "find me AI quotes from Reddit every day"
2. Anton calls `agent` tool → user sees confirmation dialog → approves
3. `AgentManager.createAgent()` creates conversation directory + `agent.json`
4. `originConversationId` set to A (the human's conversation)
5. UI shows new agent card in the Agents tab

### Execution

1. `AgentManager.tick()` runs every 30s, checks cron schedules
2. When it's time: `runAgent(sessionId)` → `sendMessage(sessionId, instructions)`
3. This goes through the normal `handleChatMessage()` path — same as a user typing
4. The conversation runs, uses tools, writes scripts, produces output
5. On completion: status updated, `agent.json` persisted

### First Run vs Subsequent Runs

**First run:** The agent builds its tooling — writes scripts, installs deps, tests them, returns first results.

**Subsequent runs:** Runs its existing scripts, processes output, returns results. If something broke, fixes it.

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

### User Interaction

Users can open an agent's conversation and chat with it. Messages between runs become permanent adjustments — the agent reads them on the next run and adapts.

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
| `packages/desktop/src/components/projects/ProjectLanding.tsx` | Agent cards (clickable, open conversation) |
| `packages/desktop/src/lib/store.ts` | `projectAgents: AgentSession[]` |
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
