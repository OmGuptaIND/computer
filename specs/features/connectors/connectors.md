# Connectors Spec

## Overview

Connectors integrate external services (Slack, Gmail, GitHub, etc.) into the agent. Three connector types:

| Type | How it works | Auth | Example |
|------|-------------|------|---------|
| `oauth` | Direct API calls, one-click OAuth flow | OAuth 2.0 via proxy | Slack, GitHub |
| `mcp` | Spawns MCP server subprocess (stdio JSON-RPC) | Manual env vars | Custom servers |
| `api` | Direct API calls with user-provided credentials | Encrypted credential store | Telegram, Granola |

**OAuth connectors are the default for core services.** MCP and API remain as escape hatches for custom/community connectors.

> **Inbound traffic / bots.** Some connectors don't just *call* services
> outward -- they receive events too (Slack `@mentions`, Telegram messages,
> GitHub webhooks). All of those plug into a single unified webhook
> abstraction. See:
>
> - `specs/architecture/WEBHOOK_ROUTER.md` -- the `WebhookProvider` /
>   `WebhookRouter` pattern under `/_anton/webhooks/{slug}` that every
>   inbound integration shares.
> - `specs/features/SLACK_BOT.md` -- the Slack-specific design:
>   two connectors (`slack` user delegate + `slack-bot` workspace bot),
>   developer-owned Cloudflare Worker fan-out, per-install `forward_secret`,
>   and the ownership-transfer UX that lets multiple Antons coexist on the
>   same Slack app.

## Architecture

```
Desktop UI                Agent Server (VPS)              OAuth Proxy (CF Worker)
--------------            ------------------              ----------------------
Click "Connect"           Generate state nonce
  -> WS: oauth_start      Build authorize URL
  <- WS: oauth_url        -------------------------------->  302 to provider
Open browser                                              User authorizes
                          POST /_anton/oauth/cb  <--------  Exchange code -> token
                          Encrypt + store in CredentialStore
                          Activate connector via configure()
  <- WS: oauth_complete   Tools available in session
```

## Credential System

All connector secrets (OAuth tokens, API keys, bot tokens, wallet addresses) are stored in a unified encrypted credential store. See `specs/features/connector-credentials.md` for the full design.

**Key properties:**
- All secrets encrypted at rest (AES-256-GCM) in `~/.anton/tokens/{id}.enc`
- `config.yaml` is secret-free -- safe to back up, share, or inspect
- Desktop client never receives secrets -- only `hasCredentials: boolean`
- Single `configure(config: ConnectorEnv)` interface for all connector types

## OAuth Flow (One-Click Connectors)

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| OAuth Proxy | Separate CF Worker project | Holds client_id/secret, handles code exchange |
| OAuthFlow | `agent-server/src/oauth/oauth-flow.ts` | State management, token refresh |
| CredentialStore | `agent-server/src/credential-store.ts` | AES-256-GCM encrypted credential storage |
| ConnectorManager | `packages/connectors/connector-manager.ts` | Manages active direct connectors |
| Direct connectors | `packages/connectors/slack/`, `github/` | Typed API clients + tool definitions |

### Credential Storage

All connector credentials are stored encrypted on each user's VPS:

```
~/.anton/tokens/
  slack.enc              # AES-256-GCM encrypted (OAuth token)
  github.enc             # AES-256-GCM encrypted (OAuth token)
  telegram.enc           # AES-256-GCM encrypted (API secrets)
  granola.enc            # AES-256-GCM encrypted (API key)
```

- Encryption key derived from `config.token` via HKDF (`sha256`, salt: `anton-token-store`)
- Format: `iv (12 bytes) + auth tag (16 bytes) + ciphertext`
- File permissions: `0600`
- Tokens never leave the user's VPS unencrypted
- `StoredCredentials` type supports both OAuth fields (`accessToken`, `refreshToken`, `expiresAt`) and arbitrary secrets (`secrets: Record<string, string>`)
- Existing `.enc` files are backward compatible -- `secrets` is an optional field

### OAuth Proxy

The proxy is a stateless Cloudflare Worker. It holds OAuth app credentials (client_id/secret) and handles the authorization redirect + code-for-token exchange.

**Key points:**
- Proxy stores NOTHING after the exchange
- Tokens are POSTed to the agent's callback URL, then forgotten
- State parameter is HMAC-signed to prevent CSRF
- Open source -- anyone can deploy their own

**Endpoints:**
- `GET /oauth/:provider/authorize` -- 302 redirect to provider consent
- `GET /oauth/:provider/callback` -- exchange code, POST token to agent
- `POST /oauth/:provider/refresh` -- refresh expired tokens
- `GET /providers` -- list configured providers

### Environment Variables

Set on the agent server (in `~/.anton/agent.env`):

```
OAUTH_PROXY_URL=https://your-proxy.workers.dev
OAUTH_CALLBACK_BASE_URL=https://yourname.antoncomputer.in
```

Configure via CLI: `sudo anton computer config oauth`

### Direct Connector Interface

All connectors implement `DirectConnector` with a single `configure()` method:

```ts
interface ConnectorEnv {
  env: Record<string, string>       // All config values resolved from credential store + process.env
  refreshToken?: () => Promise<string>  // Lazy OAuth token refresh (API connectors don't get this)
}

interface DirectConnector {
  readonly id: string
  readonly name: string
  readonly surfaces?: ConnectorSurface[]
  configure(config: ConnectorEnv): void
  getTools(): AgentTool[]
  testConnection(): Promise<{ success: boolean; error?: string; info?: string }>
}
```

**Connector patterns:**

| Pattern | Connectors | How configure() works |
|---------|-----------|----------------------|
| OAuth | GitHub, Gmail, Notion, Linear, Airtable, Slack, Google Calendar/Drive/Docs/Sheets/Search Console | Reads `env.ACCESS_TOKEN`, sets `refreshToken` provider |
| API key | Telegram, Granola | Reads key from `env` (e.g. `TELEGRAM_BOT_TOKEN`, `GRANOLA_API_KEY`) |
| Compound token | LinkedIn, Exa | Reads `env.ACCESS_TOKEN` (compound format parsed internally) |

### ConnectorManager

```ts
type EnvResolver = (providerId: string) => Promise<ConnectorEnv>

class ConnectorManager {
  constructor(factories: Record<string, ConnectorFactory>, resolveEnv: EnvResolver)
  activate(id, opts?): Promise<boolean>   // resolveEnv -> configure
  deactivate(id): void
  reconfigure(id): Promise<void>          // re-resolve env on a live instance
  getAllTools(surface?): AgentTool[]
  testConnection(id): Promise<{...}>
}
```

### Direct Connector Tools

**Slack** (`packages/connectors/src/slack/`):
- `slack_list_channels`, `slack_send_message`, `slack_get_history`
- `slack_get_thread`, `slack_list_users`, `slack_search`, `slack_add_reaction`

**GitHub** (`packages/connectors/src/github/`):
- `github_list_repos`, `github_get_repo`, `github_list_issues`, `github_get_issue`
- `github_create_issue`, `github_add_comment`, `github_list_prs`, `github_get_pr`
- `github_search_code`, `github_search_issues`

Tool naming: `{service}_{action}` (no `mcp_` prefix).

## MCP Connectors (`type: 'mcp'`)

Run an MCP server process. The agent communicates via JSON-RPC 2.0 over stdio.

- Requires `command` and `args` fields
- `requiredEnv` values are passed as environment variables to the spawned process
- Tool naming: `mcp_{serverId}_{toolName}`
- Auto-reconnect on process crash (5s delay)
- Health checks every 60s

## API Connectors (`type: 'api'`)

API key-based integrations. All credentials from `requiredEnv` and `optionalFields` are stored encrypted in the credential store. The connector reads them from the `env` bag passed to `configure()`.

The server resolves env for API connectors using:
1. Encrypted secrets from credential store (highest priority)
2. `process.env` fallback using declared registry keys (e.g. `TELEGRAM_BOT_TOKEN`)

## Adding a New Built-in Connector

### OAuth Connector (recommended for core services)

1. **Add provider to OAuth proxy** (`oauth-proxy/src/providers/`):
   ```ts
   export const yourservice: OAuthProviderConfig = {
     authorizeUrl: 'https://...',
     tokenUrl: 'https://...',
     scopes: ['read', 'write'],
     pkce: false,
   }
   ```

2. **Register OAuth app** with the provider, set redirect URL to `https://<proxy>/oauth/yourservice/callback`

3. **Set CF Worker secrets**: `wrangler secret put YOURSERVICE_CLIENT_ID`, etc.

4. **Add direct connector** (`packages/connectors/src/yourservice/`):
   - `api.ts` -- typed HTTP client
   - `tools.ts` -- AgentTool definitions
   - `index.ts` -- DirectConnector implementation with `configure(config: ConnectorEnv)`

5. **Add to factory** (`packages/connectors/src/index.ts`):
   ```ts
   CONNECTOR_FACTORIES['yourservice'] = () => new YourServiceConnector()
   ```

6. **Add registry entry** (`packages/agent-config/src/config.ts`):
   ```ts
   { id: 'yourservice', type: 'oauth', oauthProvider: 'yourservice', ... }
   ```

7. **Add brand icon** (`packages/desktop/src/components/connectors/ConnectorIcons.tsx`)

### API Connector (for key-based services)

1. **Add direct connector** (`packages/connectors/src/yourservice/`):
   - `api.ts` -- typed HTTP client
   - `tools.ts` -- AgentTool definitions
   - `index.ts` -- DirectConnector implementation reading keys from `config.env`

2. **Add to factory and registry** with `type: 'api'`, `requiredEnv: ['YOUR_API_KEY']`, and optional `optionalFields`

3. All credentials are encrypted automatically via the credential store -- no special handling needed

### MCP Connector (for community/custom services)

1. Add registry entry with `type: 'mcp'`, `command`, `args`, `requiredEnv`
2. Add brand icon
3. That's it -- MCP protocol handles tool discovery automatically

## Protocol Messages

| Direction | Message | Purpose |
|-----------|---------|---------|
| C -> S | `connectors_list` | Request all connector statuses |
| C -> S | `connector_add` | Add a connector (sends `env` bag for API connectors) |
| C -> S | `connector_update` | Update a connector (can include `env` for credential updates) |
| C -> S | `connector_remove` | Remove a connector (deletes credentials) |
| C -> S | `connector_toggle` | Enable/disable a connector |
| C -> S | `connector_test` | Test connection, list tools |
| C -> S | `connector_registry_list` | Request built-in registry |
| C -> S | `connector_oauth_start` | Start OAuth flow for a provider |
| C -> S | `connector_oauth_disconnect` | Disconnect OAuth connector (drops token then delegates to full removal -- see invariant below) |
| S -> C | `connectors_list_response` | Full connector status list (includes `hasCredentials`) |
| S -> C | `connector_added` | Confirmation with status |
| S -> C | `connector_status` | Status update |
| S -> C | `connector_test_response` | Test result with tools list |
| S -> C | `connector_registry_list_response` | Built-in registry entries |
| S -> C | `connector_oauth_url` | Auth URL for desktop to open |
| S -> C | `connector_oauth_complete` | OAuth flow result |

## Security

### Credential Isolation

- All connector secrets (OAuth tokens AND API keys) encrypted at rest (AES-256-GCM) in `~/.anton/tokens/`
- Each user's credentials are on their own VPS, encrypted with their own agent token via HKDF
- `config.yaml` contains NO secrets -- safe to inspect, backup, or share
- Desktop client receives `hasCredentials: boolean`, never actual secret values
- OAuth proxy is stateless -- holds app credentials, not user tokens
- Direct API calls use credentials from encrypted store via closure -- never in system prompt

### process.env Fallback

For headless / systemd deployments, connectors can be configured via environment variables without the UI:
- Set `TELEGRAM_BOT_TOKEN` in `~/.anton/agent.env` and Telegram activates on startup
- The server checks `process.env` as a fallback, but ONLY for keys declared in the connector's registry entry
- No wildcard env scanning -- only `requiredEnv` and `optionalFields` keys are checked

### Credential Cleanup

- `connector_remove` deletes the `.enc` file via `credentialStore.delete(id)`
- `connector_oauth_disconnect` runs full removal (token + config + tools + cleanup hooks)
- Agent token rotation makes existing secrets unreadable (expected -- same as OAuth behavior)

### Caddy Routing

The `/_anton/oauth/callback` route MUST go to the agent (port 9876), not the sidecar:

```
handle /_anton/oauth/* {
    reverse_proxy localhost:9876
}
handle_path /_anton/* {
    reverse_proxy localhost:9878
}
```

## Environment File Path

**Canonical path:** `~/.anton/agent.env` (same as Ansible)

The CLI auto-detects the path by reading the systemd service's `EnvironmentFile` directive. Falls back to `~/.anton/agent.env`.

## Key Files

| File | Purpose |
|------|---------|
| `packages/agent-config/src/config.ts` | ConnectorConfig, ConnectorRegistryEntry, CONNECTOR_REGISTRY |
| `packages/connectors/src/` | Direct API connectors (Slack, GitHub, Telegram, etc.) |
| `packages/connectors/src/types.ts` | `DirectConnector`, `ConnectorEnv`, `ConnectorFactory` types |
| `packages/connectors/src/connector-manager.ts` | ConnectorManager -- activation, env resolution, tool aggregation |
| `packages/agent-server/src/credential-store.ts` | CredentialStore -- encrypted credential storage for all connector types |
| `packages/agent-server/src/oauth/oauth-flow.ts` | OAuth state machine, token refresh |
| `packages/agent-server/src/oauth/oauth-callback.ts` | HTTP callback handler |
| `packages/agent-server/src/server.ts` | WS handlers, `resolveConnectorEnv()`, HTTP callback route, session wiring |
| `packages/agent-core/src/agent.ts` | `buildTools()` -- merges MCP + direct connector tools |
| `packages/agent-core/src/session.ts` | Passes connectorManager to buildTools |
| `packages/protocol/src/messages.ts` | Connector message types (includes `hasCredentials` on status) |
| `packages/desktop/src/components/connectors/ConnectorsPage.tsx` | Connector UI -- sends all values in single `env` bag |

## Invariants & Rules

These are hard rules that MUST hold. Violations cause API failures or broken UI.

### Tool Name Uniqueness

**Rule:** All tool names sent to the LLM API MUST be unique. Duplicate names cause `400 invalid_request_error`.

- `buildTools()` in `agent-core/src/agent.ts` deduplicates by name (first definition wins)
- Connector tool names MUST use the `{service}_{action}` prefix convention
- Each connector MUST NOT define the same tool name twice (e.g. two `gsc_inspect_url`)
- MCP tools are namespaced as `mcp_{serverId}_{toolName}` -- safe by design

### Connector Type Handling

**Rule:** Server handlers (toggle, test, remove) MUST handle ALL connector types, not just MCP.

Three managers exist for different connector types:

| Manager | Connector Types | Methods |
|---------|----------------|---------|
| `mcpManager` | `mcp` | toggleConnector, testConnector, removeConnector, setToolPermissions, getToolPermission |
| `connectorManager` | `oauth`, `api` | activate, deactivate, reconfigure, testConnection, setToolPermissions, getToolPermission |
| `oauthFlow` | `oauth` (tokens) | hasToken, startFlow, disconnect |

Server handlers MUST check connector type before routing to the correct manager. Pattern:

```ts
if (mcpManager knows about it) -> use mcpManager
else if (connectorManager knows about it) -> use connectorManager
else -> handle gracefully (don't throw)
```

### Unified Activation

**Rule:** All direct connector activation goes through `connectorManager.activate()`. There is no separate `activateWithToken()` path.

The `activate()` method calls `resolveConnectorEnv(id)` which handles the difference between OAuth and API connectors internally:
- OAuth connectors get `env.ACCESS_TOKEN` + `refreshToken` callback
- API connectors get their declared keys from the credential store or process.env

Server startup uses a single `startConnectors()` method for both OAuth and API connectors. No branching by type.

### Secrets Never in config.yaml

**Rule:** `config.yaml` MUST NOT contain any secrets (API keys, tokens, passwords).

- `handleConnectorAdd()` strips `env` from the config before persisting to YAML
- All secrets go to `credentialStore.save()` as encrypted `.enc` files
- The `apiKey` and `baseUrl` fields have been removed from `ConnectorConfig`
- MCP connectors still use `env` in config for non-secret environment variables passed to subprocesses

### Per-tool Permissions

**Rule:** Per-tool `never`/`ask` permissions MUST be enforced uniformly for
both MCP connectors and direct (oauth/api) connectors. The UI exposes the
toggles for every connector type, and the agent must honour them regardless
of how the tool is implemented.

Two enforcement layers, mirrored across both managers:

1. **`getAllTools()` filtering** -- tools marked `never` are stripped from
   the list before it reaches the agent, so the model never sees them.
2. **`session.beforeToolCall` gate** -- defence-in-depth. Looks up the tool
   name in *both* `mcpManager.getToolPermission()` and
   `connectorManager.getToolPermission()` and combines them (`never` wins
   over `ask` wins over `auto`). `never` blocks; `ask` routes through the
   confirm handler before the call runs.

Lifecycle wiring (server.ts) -- every place that touches a connector's
permissions must update the matching manager:

| Event | MCP path | Direct path |
|---|---|---|
| Server startup restore | `mcpManager.setToolPermissions` | `connectorManager.setToolPermissions` |
| `connector_add` | `mcpManager.setToolPermissions` | `connectorManager.setToolPermissions` |
| `connector_update` | `mcpManager.setToolPermissions` | `connectorManager.setToolPermissions` + `refreshAllSessionTools()` |
| `connector_set_tool_permission` | `mcpManager.setToolPermissions` | `connectorManager.setToolPermissions` (both, always) |
| `connector_remove` | (handled via removeConnector) | `connectorManager.setToolPermissions(id, undefined)` |

### Error Surfacing

**Rule:** LLM API errors MUST be surfaced to the user, never swallowed silently.

- The pi SDK catches API errors and sets `stopReason: 'error'` + `errorMessage` on the assistant message
- `translateEvent` in `session.ts` checks `turn_end` for `stopReason === 'error'` and emits an error event
- `agent_end` checks ALL messages (not just `[0]`) for `errorMessage`
- Server logs the error with `[session X] LLM ERROR: ...`

### OAuth Disconnect = Full Removal

**Rule:** `connector_oauth_disconnect` MUST run the same teardown sequence as
`connector_remove`. There is no separate "just delete the token" path.

The handler clears the encrypted token first (so no further outbound calls
can be made), then delegates to `handleConnectorRemove({ id })`. This
guarantees that for every OAuth connector -- and especially `slack-bot` -- the
disconnect:

- runs provider-specific cleanup hooks (e.g. `notifyProxySlackBotDisconnect`)
- calls `connectorManager.deactivate(id)` so the active client is dropped
- calls `connectorManager.setToolPermissions(id, undefined)` so a fresh
  re-install starts clean
- calls `credentialStore.delete(id)` so the `.enc` file is removed
- calls `refreshAllSessionTools()` so live sessions immediately lose the
  connector's tools (instead of attempting calls that 401 because the token
  was just deleted)
- emits `connector_removed` to the desktop

### Credential Storage Key

**Rule:** Credentials are stored under `connectorId` (e.g. `google-calendar`), NOT the shared `oauthProvider` (e.g. `google`).

Multiple connectors share one OAuth provider (Google Calendar, Google Drive, Google Docs all use `google`). Credentials MUST be stored per-connector so they can be managed independently.

### Tool Call / Result Distinction (Desktop UI)

**Rule:** Tool calls use `tc_` ID prefix, tool results use `tr_` prefix. Use the prefix to distinguish them.

- Results inherit `toolName` from their matching call (for display purposes)
- `groupMessages.ts` and `ToolCallBlock.tsx` MUST use ID prefix, not `toolName` presence, to tell calls from results
- Pattern: `msg.id.startsWith('tc_')` = call, `msg.id.startsWith('tr_')` = result
