# Connectors Spec

## Overview

Connectors integrate external services (Slack, Gmail, GitHub, etc.) into the agent via MCP servers or direct API keys. The UI groups connectors by category with brand icons and supports adding custom MCP/API connectors.

## Architecture

```
Registry (agent-config)  →  Server (agent-server)  →  Desktop UI (desktop)
     ↕                           ↕
ConnectorConfig            McpManager / API proxy
```

- **Registry**: static list of built-in connectors (`CONNECTOR_REGISTRY` in `packages/agent-config/src/config.ts`)
- **Server**: handles add/remove/toggle/test via WebSocket messages, manages MCP client connections
- **Desktop**: renders the connector cards, setup modals, and custom connector forms

## Adding a New Built-in Connector

### 1. Add the registry entry

In `packages/agent-config/src/config.ts`, add to `CONNECTOR_REGISTRY`:

```ts
{
  id: 'your-service',           // unique kebab-case id
  name: 'Your Service',         // display name
  description: 'What it does',  // one-line description
  icon: '🔧',                   // emoji fallback (used in non-UI contexts)
  category: 'productivity',     // one of: messaging | productivity | development | social | other
  type: 'mcp',                  // 'mcp' for MCP servers, 'api' for simple API key services
  command: 'npx',               // MCP only: command to run
  args: ['-y', '@your/mcp-server'],  // MCP only: command arguments
  requiredEnv: ['YOUR_API_KEY'],     // env vars the user must provide
}
```

### 2. Add the brand SVG icon

In `packages/desktop/src/components/connectors/ConnectorIcons.tsx`:

1. Create a new component (e.g. `YourServiceIcon`) with an inline SVG
2. Add it to the `ICON_MAP` keyed by the connector's `id`

```tsx
function YourServiceIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* brand SVG paths */}
    </svg>
  )
}

// In ICON_MAP:
const ICON_MAP: Record<string, ...> = {
  // ...existing entries
  'your-service': YourServiceIcon,
}
```

The `ConnectorIcon` component will automatically pick it up. Unknown IDs fall back to a generic Plug icon.

### 3. Category assignment

Categories control how connectors are grouped in the Apps tab:

| Category       | Use for                                    |
| -------------- | ------------------------------------------ |
| `messaging`    | Chat, email, notifications (Slack, Telegram) |
| `productivity` | Docs, calendar, storage (Gmail, Notion, Drive) |
| `development`  | Code, issues, CI/CD (GitHub, Linear)       |
| `social`       | Social media platforms                     |
| `other`        | Anything else                              |

## Connector Types

### MCP Connectors (`type: 'mcp'`)

Run an MCP server process. The agent communicates via the MCP protocol to discover and invoke tools.

- Requires `command` and `args` fields
- `requiredEnv` values are passed as environment variables to the spawned process
- The server manages the MCP client lifecycle (connect, disconnect, reconnect)

### API Connectors (`type: 'api'`)

Simple API key-based integrations. The first `requiredEnv` value maps to `apiKey`.

- No `command`/`args` needed
- The agent uses the API key directly for HTTP requests

## Protocol Messages

| Direction | Message                          | Purpose                        |
| --------- | -------------------------------- | ------------------------------ |
| C → S     | `connectors_list`                | Request all connector statuses |
| C → S     | `connector_add`                  | Add/connect a connector        |
| C → S     | `connector_remove`               | Remove a connector             |
| C → S     | `connector_toggle`               | Enable/disable a connector     |
| C → S     | `connector_test`                 | Test connection, list tools    |
| C → S     | `connector_registry_list`        | Request built-in registry      |
| S → C     | `connectors_list_response`       | Full connector status list     |
| S → C     | `connector_added`                | Confirmation with status       |
| S → C     | `connector_status`               | Status update                  |
| S → C     | `connector_test_response`        | Test result with tools list    |
| S → C     | `connector_registry_list_response` | Built-in registry entries    |

## Custom Connectors

Users can add custom connectors via the UI without modifying code:

- **Custom MCP**: provide name, command, args, and env vars (or paste JSON config)
- **Custom API**: provide name, base URL, and API key

Custom connectors are persisted in the project config and survive restarts.

## Security: Credential Isolation (Known Limitation)

### Current State

Connector credentials (API keys, tokens, OAuth paths) are stored **in plaintext** in the agent config file and passed as environment variables to MCP server child processes. This means:

- Any tool or sub-agent running in the same environment can read the config file and extract credentials
- MCP server processes inherit env vars, which are visible via `/proc/<pid>/environ` on Linux
- There is no access control between connectors — a GitHub connector's token is accessible to code running in the Slack connector's context
- The agent's system prompt and tool outputs could theoretically leak credential values if a prompt injection succeeds

### Threat Model

The current design assumes a **single-user trust boundary**: the user owns the machine, trusts all configured connectors, and accepts that credentials share a flat namespace. This is acceptable for local development but insufficient for:

- Multi-tenant deployments (shared VMs, cloud-hosted agents)
- Untrusted MCP servers (community/third-party connectors)
- Environments where least-privilege is required (enterprise, compliance)

### Future Mitigations

For production hardening, consider:

1. **Secret store integration** — Use OS keychain (macOS Keychain, Linux Secret Service) or a vault (HashiCorp Vault, AWS Secrets Manager) instead of plaintext config. Credentials are fetched at runtime and never written to disk.

2. **Scoped environment injection** — Only pass each connector its own required env vars, not the full set. Currently all env vars are available to all processes.

3. **Process sandboxing** — Run MCP servers in isolated containers or namespaces with restricted filesystem/network access. Each connector only sees its own credentials.

4. **Credential rotation** — Support short-lived tokens with automatic refresh instead of long-lived API keys.

5. **Audit logging** — Log which connector accessed which credential and when, to detect misuse.

6. **User confirmation for sensitive operations** — Require explicit user approval before a connector performs destructive or high-privilege actions (sending emails, deleting repos, etc.).
