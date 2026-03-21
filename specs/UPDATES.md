# anton.computer — Update System Design

> How versioning, compatibility, and self-updates work across the desktop app, the agent VM, and the wire protocol.

---

## The Problem

Anton Computer has three moving parts that version independently:

1. **Desktop app** — Tauri native app on the user's machine
2. **Agent** — Node.js daemon running on the user's VM
3. **Wire protocol** — The spec both sides speak over WebSocket

When you ship a new feature, you might update the agent but the user's desktop is old. Or vice versa. Or the protocol changes and one side doesn't understand the other. You need:

- A way to know what version each side is running
- A way to know if they're compatible
- A way to update the agent without SSH
- A way to tell the user "hey, update available"

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────────┐
│  Desktop    │◄──ws──► │  Agent (VM)  │◄──http──►│  GitHub manifest │
│  (Tauri)    │         │  (Node.js)   │          │  manifest.json   │
│             │         │              │          └──────────────────┘
│ MIN_AGENT_  │         │ MIN_CLIENT_  │
│ SPEC=0.4.0  │         │ SPEC=0.3.0   │
└─────────────┘         └──────────────┘
```

### Three Version Numbers

| Version | Where it lives | What it means |
|---------|---------------|---------------|
| **Package version** (e.g. `0.5.0`) | `package.json` | The release version. Bumped every release. |
| **Spec version** (e.g. `0.5.0`) | `SPEC.md` + `version.ts` | Wire protocol version. Bumped when message formats change. |
| **Git hash** (e.g. `a1b2c3d`) | Runtime via `git rev-parse` | Exact build. Useful for debugging. |

The desktop has its own version in `tauri.conf.json`, but for compatibility what matters is the **spec version** — that's the contract between client and agent.

## Compatibility Model

### How it works

Each side declares the **minimum spec version** it needs from the other:

```typescript
// Agent side (agent-config/src/version.ts)
SPEC_VERSION = '0.5.0'      // What I speak
MIN_CLIENT_SPEC = '0.3.0'   // Oldest client I support

// Desktop side
MIN_AGENT_SPEC = '0.4.0'    // Oldest agent I can talk to
```

### During handshake

The agent sends all of this in `auth_ok`:

```json
{
  "type": "auth_ok",
  "agentId": "anton-vm1-abc123",
  "version": "0.5.0",
  "gitHash": "a1b2c3d",
  "specVersion": "0.5.0",
  "minClientSpec": "0.3.0",
  "updateAvailable": {
    "version": "0.6.0",
    "specVersion": "0.6.0",
    "changelog": "- New feature X\n- Fixed bug Y",
    "releaseUrl": "https://github.com/OmGuptaIND/anton.computer/releases"
  }
}
```

The desktop checks:
1. Is `specVersion >= MIN_AGENT_SPEC`? If no → show "Agent outdated, please update" banner
2. Is `updateAvailable` present? If yes → show "Update available" banner
3. Is `minClientSpec` newer than my own spec? If yes → show "Desktop outdated" warning

### Backward compatibility rules

- Unknown fields are ignored (old clients won't break on new fields)
- Unknown message types are dropped (old agents ignore `update_check`)
- New features degrade gracefully (no update UI on old agents, that's fine)

This means you can **always connect**. The worst case is missing features, never a crash.

## Self-Update System

### The manifest

A single JSON file at the repo root (`manifest.json`), also served via GitHub raw URL:

```json
{
  "version": "0.5.0",
  "specVersion": "0.5.0",
  "gitHash": "a1b2c3d",
  "releaseUrl": "https://github.com/OmGuptaIND/anton.computer/releases",
  "changelog": "- Added self-update system\n- Version compatibility checks",
  "publishedAt": "2026-03-21T00:00:00Z"
}
```

This is the **single source of truth** for "what's the latest version". Update this file when you push a release.

### How the agent checks

The `Updater` service (`packages/agent-server/src/updater.ts`) runs on the VM:

1. **On startup** — fetch manifest, compare versions
2. **Every hour** — fetch again (configurable via `UPDATE_CHECK_INTERVAL`)
3. **On demand** — client sends `update_check` message
4. **Cache** — result saved to `~/.anton/update-manifest.json` (survives restarts)

If a newer version exists, the agent:
- Caches the manifest
- Includes `updateAvailable` in the next `auth_ok` handshake
- Emits `update_available` event to any connected client

### How self-update works

```
User clicks "Update"
        │
        ▼
Desktop sends: { type: "update_start" }
        │
        ▼
Agent runs self-update pipeline:
        │
        ├── 1. git pull --ff-only
        │      → { stage: "pulling", message: "..." }
        │
        ├── 2. pnpm install --no-frozen-lockfile
        │      → { stage: "installing", message: "..." }
        │
        ├── 3. pnpm build (all packages in order)
        │      → { stage: "building", message: "..." }
        │
        ├── 4. Write ~/.anton/version.json
        │
        ├── 5. systemctl restart anton-agent
        │      → { stage: "restarting", message: "..." }
        │
        └── 6. Done (or error)
               → { stage: "done", message: "Updated to v0.6.0 (abc1234)" }
```

Each step streams `update_progress` messages back to the client so you can show a progress indicator.

After restart, the desktop auto-reconnects (it already has 3-second reconnect logic) and gets the new version in `auth_ok`.

### Where the agent finds its source code

The updater checks these locations in order:

1. **Git root** — if running from source (`git rev-parse --show-toplevel`)
2. **`~/.anton/agent/`** — deployed via `make sync`
3. **`/opt/anton/`** — system install

## Protocol Messages

All update messages use the **CONTROL channel** (0x00):

| Direction | Message | Purpose |
|-----------|---------|---------|
| Client → Agent | `update_check` | "Check for updates now" |
| Agent → Client | `update_check_response` | Current + latest versions, changelog |
| Client → Agent | `update_start` | "Go ahead and update yourself" |
| Agent → Client | `update_progress` | Stage-by-stage progress |

Plus one **EVENTS channel** (0x04) message:

| Direction | Message | Purpose |
|-----------|---------|---------|
| Agent → Client | `update_available` | Proactive notification when periodic check finds a new version |

## Desktop Store

The Zustand store tracks update state:

```typescript
// Version info (set on auth_ok)
agentVersion: string | null
agentSpecVersion: string | null
agentGitHash: string | null

// Update state
updateInfo: UpdateInfo | null     // latest version details
updateStage: UpdateStage          // current self-update progress
updateMessage: string | null      // progress message
updateDismissed: boolean          // user dismissed the banner
```

The `Connection` class exposes:
- `connection.sendUpdateCheck()` — trigger a manual check
- `connection.sendUpdateStart()` — start self-update

## Release Workflow

### Shipping an update to testers

1. Make your changes, push to `main`
2. Update `manifest.json` at repo root:
   ```json
   {
     "version": "0.6.0",
     "specVersion": "0.5.0",
     "gitHash": "",
     "releaseUrl": "https://github.com/OmGuptaIND/anton.computer/releases",
     "changelog": "- What changed",
     "publishedAt": "2026-03-22T00:00:00Z"
   }
   ```
3. Agents pick it up within 1 hour (or user triggers manual check)
4. User clicks "Update" in desktop → agent pulls, builds, restarts
5. Desktop reconnects and shows the new version

### When to bump what

| Change | Bump package version | Bump spec version |
|--------|---------------------|-------------------|
| Bug fix (no protocol change) | Yes | No |
| New feature (new messages) | Yes | Yes |
| Breaking protocol change | Yes | Yes + update `MIN_CLIENT_SPEC` / `MIN_AGENT_SPEC` |
| Desktop-only change | Desktop version only | No |

### What happens if versions mismatch

| Scenario | What happens |
|----------|-------------|
| Old desktop, new agent | Works fine. Desktop ignores unknown fields/messages. Missing new UI features. |
| New desktop, old agent | Works fine. Agent ignores unknown messages. Desktop shows "Agent outdated" banner. |
| Desktop spec < agent's `minClientSpec` | Desktop shows "Please update your desktop app" warning. Still connects. |
| Agent spec < desktop's `MIN_AGENT_SPEC` | Desktop shows "Agent outdated — please update" banner. Still connects. |

**Nothing ever breaks.** The worst case is degraded features with a banner telling you what to do.

## File Map

```
packages/agent-config/src/version.ts    ← Version constants, semver utils, manifest types
packages/protocol/src/messages.ts        ← Update protocol message types
packages/agent-server/src/updater.ts     ← Updater service (check + self-update)
packages/agent-server/src/server.ts      ← Wired into handshake + control channel
packages/desktop/src/lib/connection.ts   ← sendUpdateCheck(), sendUpdateStart()
packages/desktop/src/lib/store.ts        ← Update state in Zustand store
manifest.json                            ← Release manifest (source of truth)
SPEC.md                                  ← Wire protocol spec (v0.5.0 section)
```
