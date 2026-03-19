# AntonComputer — Architecture

## Overview

AntonComputer is a personal cloud computer system with three components:

```
┌─────────────────────┐                          ┌─────────────────────┐
│   Desktop App       │    Persistent Pipes       │   Your VPS/VM       │
│   (Tauri v2)        │◄────────────────────────►│                     │
│                     │   WebSocket / WireGuard   │   ┌───────────────┐ │
│  ┌───────────────┐  │                          │   │  Agent Daemon │ │
│  │ Terminal      │──┼──── PTY pipe ───────────┼──►│  (Go binary)  │ │
│  │ File Browser  │──┼──── FileSync pipe ──────┼──►│               │ │
│  │ AI Chat       │──┼──── AI Stream pipe ─────┼──►│  ┌─────────┐  │ │
│  │ Apps Dashboard│──┼──── Port Forward pipe ──┼──►│  │ AI Exec │  │ │
│  │ Notifications │◄─┼──── Event pipe ─────────┼───│  │ Engine  │  │ │
│  └───────────────┘  │                          │   │  └─────────┘  │ │
└─────────────────────┘                          │   └───────────────┘ │
                                                 │                     │
        Optional:                                │   User's files,     │
┌─────────────────────┐                          │   Docker, apps,     │
│   Broker Server     │  Agent registers here    │   databases, etc.   │
│   (for NAT traverse)│◄────────────────────────┤                     │
└─────────────────────┘                          └─────────────────────┘
```

## Component Details

### 1. Agent (`agent/`)

Single Go binary that runs on the user's machine (VPS, VM, bare metal).

```
agent/
├── cmd/
│   └── antonagent/         # Entry point
│       └── main.go
├── pkg/
│   ├── pty/                # PTY management
│   │   └── pty.go          # Spawn shells, multiplex sessions
│   ├── filesync/           # File synchronization
│   │   ├── watcher.go      # fsnotify-based file watcher
│   │   ├── sync.go         # Diff/patch engine
│   │   └── protocol.go     # Sync wire protocol
│   ├── portfwd/            # Port forwarding
│   │   ├── scanner.go      # Detect listening ports
│   │   └── tunnel.go       # TCP tunnel over WebSocket
│   ├── events/             # Event bus
│   │   └── bus.go          # Pubsub for agent → client events
│   ├── tools/              # Tool registry for AI
│   │   ├── registry.go     # Tool registration + dispatch
│   │   ├── shell.go        # Execute shell commands
│   │   ├── filesystem.go   # Read/write/search files
│   │   └── browser.go      # Headless browser (rod/chromedp)
│   └── ai/                 # AI runtime
│       ├── engine.go       # Interface for AI backends
│       ├── builtin.go      # Built-in thin executor (v0.1)
│       ├── openclaw.go     # OpenClaw integration (v0.2)
│       └── models/
│           ├── claude.go   # Anthropic API
│           ├── openai.go   # OpenAI-compatible API
│           └── ollama.go   # Local Ollama
└── go.mod
```

**Key design decisions:**
- Single binary, zero runtime dependencies (statically compiled Go)
- Runs as systemd service or foreground process
- Config via `~/.antoncomputer/config.yaml` or env vars
- All pipes multiplex over a single WebSocket connection
- Agent exposes NO HTTP API — everything flows through the pipe protocol

### 2. Desktop App (`desktop/`)

Tauri v2 — Rust backend for system integration, web frontend for UI.

```
desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri entry point
│   │   ├── tunnel.rs        # Connection manager (WS + WireGuard)
│   │   ├── sync.rs          # Local file watcher for sync
│   │   ├── tray.rs          # System tray / menubar
│   │   └── commands.rs      # Tauri commands exposed to frontend
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                     # Web frontend (React or Svelte)
│   ├── App.tsx
│   ├── terminal/            # xterm.js terminal component
│   ├── chat/                # AI chat interface
│   ├── files/               # Remote file browser + sync UI
│   ├── apps/                # Running services/ports dashboard
│   └── settings/            # Machine config, preferences
├── package.json
└── vite.config.ts
```

### 3. Broker Server (`server/`) — Optional

Lightweight relay for users whose agents are behind NAT/firewalls.

```
server/
├── cmd/
│   └── antonbroker/
│       └── main.go
├── pkg/
│   ├── broker/
│   │   ├── relay.go         # WebSocket relay (desktop ↔ agent)
│   │   └── registry.go      # Agent registration + discovery
│   └── auth/
│       └── token.go         # Token issuance + validation
└── go.mod
```

For v0.1, the broker is optional. Users connect directly to their VPS IP.

## Pipe Protocol

All communication uses a single WebSocket with multiplexed channels:

```
┌──────────────────────────────────────────┐
│ WebSocket Frame                          │
│ ┌──────────┬───────┬───────────────────┐ │
│ │ pipe_id  │ type  │ payload           │ │
│ │ (uint16) │(uint8)│ (variable bytes)  │ │
│ └──────────┴───────┴───────────────────┘ │
└──────────────────────────────────────────┘

Types:
  0x01 = Terminal (PTY data)
  0x02 = Terminal resize
  0x03 = FileSync operation
  0x04 = Port forward data
  0x05 = AI chat message
  0x06 = AI tool call
  0x07 = AI tool result
  0x08 = Event notification
  0x09 = Control (ping/pong, auth, pipe open/close)
```

## AI Runtime Architecture

```
Desktop Chat ──► Agent AI Engine ──► LLM API (Claude/GPT/Ollama)
                      │                        │
                      │◄── tool calls ─────────┘
                      │
                      ▼
                 Tool Registry
                 ├── shell.exec("ls -la")
                 ├── fs.read("/etc/nginx/nginx.conf")
                 ├── fs.write(path, content)
                 ├── fs.search(pattern)
                 ├── browser.fetch(url)
                 └── [user-defined tools via plugins]
```

The built-in executor is intentionally simple — a tool-calling loop:
1. User sends message
2. Engine forwards to LLM with tool definitions
3. LLM returns tool calls
4. Engine executes tools locally on the VM
5. Results sent back to LLM
6. Repeat until LLM returns a text response
7. Stream response back to desktop

For users who want the full OpenClaw experience (50+ integrations, memory, workflows), they can switch the engine to OpenClaw mode, which manages an OpenClaw instance as a subprocess.

## Security Model

- Agent authenticates to desktop via a shared secret (generated on first setup)
- All WebSocket connections are TLS-encrypted
- Agent runs as a dedicated user (not root) by default
- AI tool execution is sandboxed: shell commands run in a restricted shell, fs access is scoped
- Confirmation flow: dangerous operations (rm -rf, system changes) require desktop approval
- Audit log: all AI actions logged to ~/.antoncomputer/audit.log

## Connection Modes

1. **Direct** (v0.1): Desktop → agent IP:port over WebSocket (user opens port or uses VPN)
2. **Broker relay**: Desktop → broker → agent (NAT traversal, no port opening needed)
3. **WireGuard mesh** (future): Tailscale-like, peer-to-peer encrypted tunnel
```

