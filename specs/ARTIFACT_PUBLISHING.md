# Artifact Publishing

Public URL serving for agent-created artifacts + redesigned artifact sidebar.

## URL Scheme

| Type | URL | Source Directory |
|------|-----|-----------------|
| Standalone artifact | `{slug}.antoncomputer.in/a/{artifact-id}` | `~/.anton/published/{artifact-id}/index.html` |
| Project public file | `{slug}.antoncomputer.in/p/{project-name}/{path}` | `~/Anton/{project-name}/public/{path}` |

## Directory Layout

```
~/.anton/published/
└── {artifact-id}/
    └── index.html          # Full HTML document (converted from md/svg/mermaid/code/html)

~/Anton/{project-name}/
└── public/                 # Project public files (served by Caddy)
    ├── index.html
    └── ...
```

## Caddy Routing

Added to the existing Caddyfile (before the catch-all reverse_proxy):

```
${DOMAIN} {
    handle /a/* {
        uri strip_prefix /a
        root * /home/anton/.anton/published
        file_server
    }
    handle /p/* {
        uri strip_prefix /p
        root * /home/anton/Anton
        file_server
    }
    reverse_proxy localhost:${AGENT_PORT}
}
```

Routes are ordered: `/a/*` and `/p/*` match first, everything else falls through to the agent WebSocket.

## Publish Tool

Agent tool `publish` — writes content as a full HTML document to the published directory.

**File:** `packages/agent-core/src/tools/publish.ts`

### Input

```typescript
interface PublishInput {
  title: string
  content: string
  type: 'html' | 'markdown' | 'svg' | 'mermaid' | 'code'
  language?: string       // For code type (syntax highlighting)
  slug?: string           // Custom URL slug; auto-generated 8-char ID if omitted
}
```

### Content Conversion

| Type | Conversion |
|------|-----------|
| `html` | Ensure `<!DOCTYPE html>` wrapper, pass through |
| `markdown` | Wrap in HTML with marked CDN for client-side rendering |
| `svg` | Wrap in HTML with viewport meta, embed SVG inline |
| `mermaid` | Wrap in HTML with mermaid CDN script |
| `code` | Wrap in HTML with `<pre><code>` and monospace styling |

### Output

Returns confirmation string: `Published "{title}" → https://{domain}/a/{slug}`

### Domain Resolution

The `DOMAIN` env var (set by cloud-init) flows through:
1. `cloud-init.sh` → writes to `/etc/anton-agent.env`
2. `server.ts` → reads `process.env.DOMAIN`, passes to `createSession()`
3. `session.ts` → passes to `ToolCallbacks.domain`
4. `agent.ts` → `publish` tool uses `callbacks?.domain` in `executePublish()`

## Protocol Messages

### Client → Server: `publish_artifact`

Direct publish from the UI (bypasses LLM). Sent on the AI channel. Handled by `server.ts` `handlePublishArtifact()`.

```typescript
interface PublishArtifactMessage {
  type: 'publish_artifact'
  artifactId: string
  title: string
  content: string
  contentType: 'html' | 'markdown' | 'svg' | 'mermaid' | 'code'
  language?: string
  slug?: string
}
```

### Server → Client: `publish_artifact_response`

```typescript
interface PublishArtifactResponse {
  type: 'publish_artifact_response'
  artifactId: string
  publicUrl: string
  slug: string
  success: boolean
  error?: string
}
```

### Server → Client: `artifact_published` (event channel)

Emitted alongside `publish_artifact_response` for real-time UI updates.

```typescript
interface ArtifactPublishedEvent {
  type: 'artifact_published'
  artifactId: string
  slug: string
  publicUrl: string
}
```

## Artifact Sidebar Redesign

The old monolithic `ArtifactPanelContent` (tab bar + toolbar + preview) was replaced with a proper list/detail architecture.

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `ArtifactPanelContent` | `ArtifactPanel.tsx` | Orchestrator: routes to empty/list/detail |
| `ArtifactEmptyState` | `ArtifactEmptyState.tsx` | Centered empty state with icon + message |
| `ArtifactListView` | `ArtifactListView.tsx` | Search bar + filter chips + scrollable artifact list |
| `ArtifactListItem` | `ArtifactListItem.tsx` | Single artifact row: icon, title, badge, time, published dot |
| `ArtifactDetailView` | `ArtifactDetailView.tsx` | Full preview with back button, actions, publish banner |

### View Flow

```
ArtifactPanelContent
  ├── artifacts.length === 0 → ArtifactEmptyState
  ├── artifactViewMode === 'list' → ArtifactListView
  └── artifactViewMode === 'detail' → ArtifactDetailView
```

### New Store State

```typescript
// State
artifactSearchQuery: string          // Search input value
artifactFilterType: 'all' | ArtifactRenderType  // Filter chip selection
artifactViewMode: 'list' | 'detail'  // Current view

// Actions
setArtifactSearchQuery(query)
setArtifactFilterType(type)
setArtifactViewMode(mode)
updateArtifactPublishStatus(artifactId, url, slug)
```

### Artifact Type Extensions

```typescript
interface Artifact {
  // ... existing fields ...
  publishedUrl?: string      // Public URL after publishing
  publishedSlug?: string     // URL slug
  publishedAt?: number       // Timestamp
  conversationId?: string    // Source conversation
  projectId?: string         // Source project
}
```

### Detail View Actions

- **Preview/Source toggle** — switch between rendered and raw views
- **Copy** — copy artifact content to clipboard
- **Download** — client-side blob download with correct filename/extension
- **Publish** — sends `publish_artifact` WS message, shows URL when done
- **Copy URL** — copies published URL to clipboard (visible only when published)

### SidePanel Changes

- `MAX_WIDTH`: 900 → 1100
- `DEFAULT_WIDTH`: 480 → 520

## Security

- Published files are static HTML only — no server-side execution
- Caddy's `file_server` serves files as-is with proper MIME types
- HTML artifacts use standard browser security (same-origin policy)
- No authentication on published URLs (intentionally public)
- Systemd `ReadWritePaths` updated to include `/home/anton/Anton`

## Files Modified

### Backend
- `packages/agent-config/src/config.ts` — `PUBLISHED_DIR`, `getPublishedDir()`, `getProjectPublicDir()`
- `packages/agent-core/src/tools/publish.ts` — new publish tool
- `packages/agent-core/src/agent.ts` — register publish tool, `domain` in `ToolCallbacks`
- `packages/agent-core/src/index.ts` — export `executePublish`
- `packages/agent-core/src/session.ts` — `domain` in createSession opts
- `packages/agent-server/src/server.ts` — `handlePublishArtifact()`, pass domain
- `packages/protocol/src/messages.ts` — publish message types + event
- `infra-providers/huddle/cloud-init.sh` — Caddy routes, DOMAIN env, ReadWritePaths

### Frontend
- `packages/desktop/src/lib/artifacts.ts` — extended Artifact type, helpers
- `packages/desktop/src/lib/store.ts` — new state/actions, publish response handler
- `packages/desktop/src/components/artifacts/ArtifactPanel.tsx` — rewritten orchestrator
- `packages/desktop/src/components/artifacts/ArtifactEmptyState.tsx` — new
- `packages/desktop/src/components/artifacts/ArtifactListView.tsx` — new
- `packages/desktop/src/components/artifacts/ArtifactListItem.tsx` — new
- `packages/desktop/src/components/artifacts/ArtifactDetailView.tsx` — new
- `packages/desktop/src/components/chat/ArtifactCard.tsx` — published dot, detail mode
- `packages/desktop/src/components/SidePanel.tsx` — wider defaults
- `packages/desktop/src/index.css` — all new artifact styles
