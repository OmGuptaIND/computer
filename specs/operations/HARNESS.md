# Operating the Harness Path

Practical reference for developers touching Anton's BYOS harness (Codex CLI, Claude Code, future Gemini). Pairs with [`specs/features/HARNESS_ARCHITECTURE.md`](../features/HARNESS_ARCHITECTURE.md).

## Quick map

| Concern | File |
|---|---|
| Adapter interface | `packages/agent-core/src/harness/adapter.ts` |
| Claude adapter | `packages/agent-core/src/harness/adapters/claude.ts` |
| Codex adapter | `packages/agent-core/src/harness/adapters/codex.ts` |
| Session lifecycle | `packages/agent-core/src/harness/harness-session.ts` |
| MCP shim (stdio↔IPC relay) | `packages/agent-core/src/harness/anton-mcp-shim.ts` |
| IPC server (auth + tool dispatch) | `packages/agent-core/src/harness/mcp-ipc-handler.ts` |
| Tool registry | `packages/agent-core/src/harness/tool-registry.ts` |
| Fixture tests | `packages/agent-core/src/harness/__fixtures__/` |

## Running the fixture check

Adapter `parseEvent` paths are covered by recorded-NDJSON fixtures. On every change to an adapter or to the `SessionEvent` shape:

```bash
pnpm --filter @anton/agent-core check:harness
```

Exits non-zero with a readable diff on mismatch. No test framework dependency — just `tsx`.

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

## IPC auth model

Every harness session generates a 32-byte random token. The token is:

1. Registered with the IPC server via `mcpIpcServer.registerSession(sessionId, token)` **before** the CLI is spawned.
2. Passed to the CLI process via `ANTON_AUTH` env (and inside the Codex `-c mcp_servers.anton.env.ANTON_AUTH=…` config override, because Codex controls its own MCP subprocess env).
3. Presented by the shim as its very first frame on the Unix socket: `{"method":"auth","params":{"token":"…","sessionId":"…"}}`.
4. Unregistered on session destroy (`handleSessionDestroy`) or full server shutdown.

Unauthenticated connections are dropped after 5s. A connection is **bound** to the sessionId it authed as — any subsequent `tools/call` whose `_antonSession` differs returns `-32002 session_mismatch` (never executes).

The socket path is Unix-domain only (`~/.anton/harness.sock`); no TCP, no ports.

## Error codes

Harness error events carry a `code` field. Use it when extending UI or adding telemetry:

| Code | Origin | Meaning | Suggested UI |
|---|---|---|---|
| `not_installed` | `proc.on('error')` ENOENT | CLI binary missing from PATH | "Install the CLI" + install instructions |
| `not_authed` | adapter `parseEvent` (matches 401, `unauthorized`, `not logged in`, `authentication failed`) | Provider rejected credentials | "Sign in" → re-auth flow |
| `startup_timeout` | 30s `receivedFirstEvent === false` | CLI produced no JSON output | Show stderr snippet + "Retry" |
| `runtime` | any other failure | Generic runtime error | Default error render |

Classification helper lives at the bottom of `harness-session.ts` (`classifyStartupError`). Update it whenever a new CLI introduces a distinct auth-failure phrase.

## Troubleshooting

### Codex CLI hangs after a turn starts

Known issue — Codex reads stdin and waits for more input when the pipe is open. `harness-session.ts` calls `proc.stdin?.end()` immediately after spawn to work around this. Don't remove that line.

### Non-JSON lines appear in stdout

Both CLIs occasionally print status lines ("Loading…", warnings) that aren't JSON. `harness-session.ts` wraps `JSON.parse` in try/catch and logs a warning at `debug` level. This is expected; only act if real event content is being dropped.

### "MCP shim auth rejected: bad token or unknown session"

The IPC server didn't see a matching `registerSession` call before the shim connected. Usually means the server was restarted between session creation and the shim spawning. Check that `mcpIpcServer` is initialized in the server constructor before any harness session can be created.

### `--resume` not working

Codex `exec resume` does **not** support `--color` (silently fails). The adapter's resume-args branch intentionally omits it. If you add new flags to the normal path, check both branches.

For Claude, `--resume` takes the CLI's own `session_id` emitted on `system`/`result` events. Anton's session ID is **not** the same as the CLI's — they're mapped via `HarnessSession.cliSessionId`.

## Non-goals / gotchas

- **Don't add TCP to the IPC server.** Unix socket is intentional for per-process scoping.
- **Don't rely on `--resume` as correctness.** Anton must mirror every turn into its own store; resume is a performance cache only. See architecture spec §"Session Lifecycle".
- **Don't add tools to the shim.** The shim is a thin relay; tools live in `AntonToolRegistry` on the Anton server side.
