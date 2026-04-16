# Operating the Harness Path

Practical reference for developers touching Anton's BYOS harness (Codex CLI, Claude Code, future Gemini). Pairs with [`specs/features/HARNESS_ARCHITECTURE.md`](../features/HARNESS_ARCHITECTURE.md).

## File map

| Concern | File |
|---|---|
| Adapter interface | `packages/agent-core/src/harness/adapter.ts` |
| Claude adapter | `packages/agent-core/src/harness/adapters/claude.ts` |
| Codex adapter | `packages/agent-core/src/harness/adapters/codex.ts` |
| Session lifecycle | `packages/agent-core/src/harness/harness-session.ts` |
| MCP shim (stdio↔IPC relay) | `packages/agent-core/src/harness/anton-mcp-shim.ts` |
| IPC server (auth + tool dispatch) | `packages/agent-core/src/harness/mcp-ipc-handler.ts` |
| Tool registry (session composer) | `packages/agent-core/src/harness/tool-registry.ts` |
| Shared tool catalog | `packages/agent-core/src/tools/factories.ts` (`buildAntonCoreTools`) |
| Per-tool factories | `packages/agent-core/src/tools/{memory,database,notification,publish,activate-workflow,update-project-context}.ts` |
| Prompt layer builders | `packages/agent-core/src/prompt-layers.ts` |
| Conversation mirror | `packages/agent-core/src/harness/mirror.ts` |
| Provider-switch replay seed | `packages/agent-core/src/harness/replay.ts` |
| Background memory extraction | `packages/agent-core/src/harness/memory-extract.ts` |
| Fixture + snapshot tests | `packages/agent-core/src/harness/__fixtures__/` |
| Server wiring | `packages/agent-server/src/server.ts` |
| Desktop provider picker | `packages/desktop/src/components/chat/HarnessProviderSwitch.tsx` |

## Running the check suite

All adapter, prompt-layer, tool-registry, and mirror behavior is covered by fixture- and snapshot-based checks. Run on every change to anything in `harness/`:

```bash
pnpm --filter @anton/agent-core check:harness
```

Exits non-zero with a readable diff on mismatch. No test framework dependency — just `tsx`.

What it exercises:

- **Adapter fixtures** — every `parseEvent` path on both Claude and Codex, against recorded NDJSON files.
- **Prompt-layer cases** — each `buildXLayer()` called with realistic inputs, asserts `<system-reminder>` markers.
- **Registry cases** — `buildAntonCoreTools()` gating on projectId, `onActivateWorkflow`, and connector adaptation.
- **Snapshots** — byte-for-byte output of shared prompt blocks, guards Pi-SDK-parity.
- **Identity block** — structural asserts on the harness identity `<system-reminder>#Anton` block.
- **Memory Usage guidelines** — extracted from `system.md`; asserts load-bearing markers.
- **Mirror synthesizer** — SessionEvent → SessionMessage flattening, batched tool-results, error flag propagation, metadata events dropped.
- **Round-trip** — synthesize → jsonl → `readHarnessHistory`, preserves role + tool wiring.
- **Replay seed** — renders prior conversation with turn/tool markers.

## Capturing new fixtures

When a CLI version bumps and event shapes drift:

```bash
# Claude
claude -p "list the files in this directory" \
  --output-format stream-json --verbose --permission-mode bypassPermissions \
  > packages/agent-core/src/harness/__fixtures__/claude-new-case.ndjson

# Codex
codex exec "list the files in this directory" \
  --json --color never --full-auto --skip-git-repo-check \
  > packages/agent-core/src/harness/__fixtures__/codex-new-case.ndjson
```

Then add the expected `SessionEvent[]` to `__fixtures__/expected.ts` and register the case in `__fixtures__/check.ts`.

A real-capture fixture (`codex-mcp-real.ndjson`) is already committed — use it as a template for new captures. If Codex changes the `mcp_tool_call` item shape again, that fixture fires the test before shipping.

## IPC auth model

Every harness session generates a 32-byte random token. The token is:

1. Registered with the IPC server via `mcpIpcServer.registerSession(sessionId, token)` **before** the CLI is spawned.
2. Passed to the CLI process via `ANTON_AUTH` env. For Codex, we also set `-c mcp_servers.anton.env.ANTON_AUTH=…` because Codex controls its MCP subprocess env explicitly.
3. Presented by the shim as its very first frame on the Unix socket: `{"method":"auth","params":{"token":"…","sessionId":"…"}}`.
4. Unregistered on session destroy (`handleSessionDestroy`) or provider switch (`handleSessionProviderSwitch`).

Unauthenticated connections are dropped after 5s. A connection is **bound** to the sessionId it authed as — any subsequent `tools/call` whose `_antonSession` differs returns `-32002 session_mismatch` (never executes).

The socket path is Unix-domain only: `~/.anton/harness.sock`. No TCP, no ports.

## Error codes

Harness error events carry a `code` field. Use it when extending UI or adding telemetry:

| Code | Origin | Meaning | Suggested UI |
|---|---|---|---|
| `not_installed` | `proc.on('error')` ENOENT | CLI binary missing from PATH | "Install the CLI" + install instructions |
| `not_authed` | adapter `parseEvent` (matches 401, `unauthorized`, `not logged in`, `authentication failed`) | Provider rejected credentials | "Sign in" → re-auth flow |
| `startup_timeout` | 30s `receivedFirstEvent === false` | CLI produced no JSON output | Show stderr snippet + "Retry" |
| `runtime` | any other failure | Generic runtime error | Default error render |

Classification helper lives at the bottom of `harness-session.ts` (`classifyStartupError`). Update it whenever a new CLI introduces a distinct auth-failure phrase.

## Provider-switching mid-conversation

Flow: desktop composer shows `HarnessProviderSwitch` for harness sessions. User picks → client sends `session_provider_switch` → server tears down the CLI, builds a `<system-reminder># Prior Conversation>` seed from the mirror via `buildReplaySeed()`, rebuilds the session with `createHarnessSession({replaySeedForFirstTurn})`, overwrites meta.json, and acks.

The seed is **one-shot** — injected only on turn 0 of the new provider. Subsequent turns rely on the new CLI's own `--resume` tape.

### If the seed is oversized

`buildReplaySeed` takes `maxChars` (default 12000) and `toolResultMaxChars` (default 400). It drops oldest turns first and prepends a `N older turn(s) omitted for length` marker. If the defaults prove too tight for your conversations, bump them in the server's call site.

### If the switch silently no-ops

Most likely reasons:
- The UI picker only renders for harness sessions with more than one harness provider available AND the alternate provider's CLI is marked `installed` in the providers list. If Codex isn't installed on the machine, Claude Code will show but the row will be disabled.
- The server validates that the target provider's config has `type: 'harness'`. Switching to a Pi SDK provider returns an error message, not a silent failure — check the client console.

## Background memory extraction

Pi-SDK-parity feature. After every harness turn, `runHarnessMemoryExtraction(sessionId, projectId)` fires fire-and-forget:

1. Picks a Pi SDK provider that has an API key configured (prefers `config.defaults.provider`, falls back to any match).
2. Resolves a `Model<Api>` via `resolveModel()`.
3. Reads `messages.jsonl` → AgentMessage[] via `extractHarnessMemoriesFromMirror`.
4. Delegates to the shared `extractMemories()` pipeline.
5. On success, advances the per-session cursor so next turn only scans new messages.

### When extraction skips silently

Expected reasons (all logged at `debug`):
- No Pi SDK provider has an API key → `getApiKey` returns undefined → `{skipped: true, reason: 'no API key for …'}`. Pure-harness users get memories only from explicit `memory_save` tool calls.
- Not enough new messages since last extraction.
- Serialized content below `MIN_CONTENT_LENGTH` (200 chars).
- Extraction LLM didn't find anything worth saving.

If you expect memories and none appear, check `~/.anton/memory/` timestamps and the server log for the `harness memories extracted` info line (success) or `harness memory extraction failed` warn line (error).

## Troubleshooting

### Codex CLI hangs after a turn starts

Known issue — Codex reads stdin and waits for more input when the pipe is open. `harness-session.ts` calls `proc.stdin?.end()` immediately after spawn to work around this. Don't remove that line.

### Non-JSON lines appear in stdout

Both CLIs occasionally print status lines ("Loading…", warnings) that aren't JSON. `harness-session.ts` wraps `JSON.parse` in try/catch and logs a warning. This is expected; only act if real event content is being dropped.

### "Unknown model 'gpt-5.4' for provider 'codex'" when clicking a past harness session

This used to happen when `handleSessionHistory` went through Pi SDK's `resumeSession`, which validates against Pi SDK's model registry and rejects harness-only models. Fixed by the `tryReadHarnessHistory` fast path — meta.json's provider is checked first; if harness-type, the mirror is read directly without touching Pi SDK. If you see this error again, it means either:
- meta.json is missing or malformed (e.g. a session created before Phase 4 shipped). Delete the session or backfill meta.json.
- A new harness provider isn't in `config.providers` with `type: 'harness'`. Check `DEFAULT_PROVIDERS` + user config.

### "MCP shim auth rejected: bad token or unknown session"

The IPC server didn't see a matching `registerSession` call before the shim connected. Usually means the server was restarted between session creation and the shim spawning. Check that `mcpIpcServer` is initialized in the server constructor (it is — see `new AntonToolRegistry({connectorManager, getSessionContext})`).

### `--resume` not working

Codex `exec resume` does **not** support `--color`; our adapter's resume-args branch intentionally omits it. If you add new flags to the normal path, check both branches.

For Claude, `--resume` takes the CLI's own `session_id` emitted on `system`/`result` events. Anton's session ID is **not** the same as the CLI's — they're mapped via `HarnessSession.cliSessionId`.

### "Codex picked codex_apps:gmail_search_emails instead of anton:gmail_*"

The identity block's "## MCP server preference" section tells the CLI to prefer `anton:*` over vendor MCP servers. If you still see Codex picking `codex_apps`, check:
- That the `anton` server actually exposes a matching tool (run the session with `DEBUG=mcp-ipc` and check the `tools/list` response). If the user hasn't connected Gmail in Anton's Settings → Connectors, `anton:gmail_*` won't be in the list — Codex has nowhere else to go.
- The raw stdout log — if the CLI outputs `agent_message` text saying "Using gmail:gmail" without an `mcp_tool_call` item, the adapter may have missed the call. Check `codex-events.ts` matches the live shape.

### "Harness session appears in the sidebar but clicking it shows nothing"

Check that `messages.jsonl` exists under `~/.anton/conversations/<id>/` (or the project-scoped dir). If present but empty, the turn ended with zero events (often a CLI startup failure). If absent, `ensureHarnessSessionInit` failed at session create — look for a `failed to initialize harness session on disk` warn line.

### Non-goals / gotchas

- **Don't add TCP to the IPC server.** Unix socket is intentional for per-process scoping.
- **Don't rely on `--resume` as correctness.** Anton must mirror every turn into its own store; resume is a performance cache only. See architecture spec §"Session Lifecycle".
- **Don't add tool definitions to `tool-registry.ts`.** Extend `buildAntonCoreTools()` or add a new per-tool file in `packages/agent-core/src/tools/` — the registry is a thin adapter over `AgentTool` objects, nothing more.
- **Don't duplicate prompt-block wording into `prompt-layers.ts`.** Identity block content lives there; everything else (memory usage, current context, etc.) is extracted at runtime from `system.md` or composed from shared builders. Edit `system.md` if you want to change shared guidance — both backends update together.
- **Don't re-expose CLI-native tools via MCP.** Read/write/edit/shell/grep/git/http/browser stay with the CLI. Anton adds the *layer above* (memory, connectors, projects, workflows, publish).
