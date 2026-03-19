# anton.computer — Architecture

## One-Liner

A TypeScript agent daemon on your VPS + a native desktop app on your machine, connected by WebSocket pipes. The agent uses pi SDK (OpenClaw's engine) to think and act.

## System Diagram

```
YOUR DESKTOP                                          YOUR VPS / CLOUD SERVER
┌────────────────────────┐                             ┌──────────────────────────────┐
│  Desktop App (Tauri)   │      WebSocket (TLS)        │  Agent Daemon (Node.js)      │
│                        │◄──────────────────────────►│                              │
│  ┌──────────────────┐  │   Single multiplexed conn   │  ┌────────────────────────┐  │
│  │ Terminal (xterm)  │──┼─── PTY channel ──────────►│  │  PTY Manager (node-pty)│  │
│  │ AI Agent Chat     │──┼─── AI channel ───────────►│  │  pi SDK Agent Loop     │  │
│  │ File Browser      │──┼─── FileSync channel ────►│  │  Tool Registry          │  │
│  │ Notifications     │◄─┼─── Event channel ────────┤  │  File Watcher           │  │
│  └──────────────────┘  │                             │  │  Port Scanner           │  │
│                        │                             │  └────────────────────────┘  │
│  Rust: tunnel mgr,     │                             │                              │
│  tray, local file sync │                             │  Sandbox: bubblewrap (Linux)  │
└────────────────────────┘                             │  or sandbox-exec (macOS)      │
                                                       │                              │
                                                       │  User's files, Docker, apps  │
                                                       └──────────────────────────────┘
```

## Project Structure

```
anton.computer/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── SHIPPING.md               # Task tracker
├── ARCHITECTURE.md           # This file
│
├── packages/
│   ├── agent/                # The daemon (runs on VPS)
│   │   ├── src/
│   │   │   ├── index.ts      # Entry point — start WebSocket server
│   │   │   ├── config.ts     # Load ~/.anton/config.yaml
│   │   │   ├── server.ts     # WebSocket server + pipe multiplexer
│   │   │   ├── agent.ts      # pi SDK integration — the AI brain
│   │   │   ├── pty.ts        # Terminal session manager (node-pty)
│   │   │   ├── sandbox.ts    # Sandboxed command execution
│   │   │   ├── events.ts     # Event bus (agent → desktop)
│   │   │   └── tools/
│   │   │       ├── shell.ts      # Execute commands
│   │   │       ├── filesystem.ts # Read/write/search files
│   │   │       ├── browser.ts    # Headless browsing
│   │   │       ├── process.ts    # Process management
│   │   │       └── network.ts    # Port scan, curl, DNS
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── protocol/             # Shared types & protocol spec
│   │   ├── src/
│   │   │   ├── messages.ts   # All message type definitions
│   │   │   ├── pipes.ts      # Pipe channel types
│   │   │   └── codec.ts      # Encode/decode multiplexed frames
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── desktop/              # Tauri v2 app
│       ├── src-tauri/        # Rust backend
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── tunnel.rs     # WebSocket connection manager
│       │   │   └── tray.rs       # System tray
│       │   ├── Cargo.toml
│       │   └── tauri.conf.json
│       ├── src/              # React frontend
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Terminal.tsx   # xterm.js terminal
│       │   │   ├── AgentChat.tsx  # AI agent interface
│       │   │   ├── FileTree.tsx   # Remote file browser
│       │   │   └── Connect.tsx    # Connection setup
│       │   └── lib/
│       │       ├── ws.ts         # WebSocket client
│       │       └── protocol.ts   # Import from @anton/protocol
│       ├── package.json
│       └── vite.config.ts
│
├── deploy/
│   ├── install.sh            # curl | bash installer
│   ├── Dockerfile            # Agent Docker image
│   └── docker-compose.yml
│
└── docs/
```

## Agent Architecture (The Core)

### How the AI Brain Works

The agent uses **pi SDK** (`@mariozechner/pi-coding-agent`) — the same engine that powers OpenClaw (250k+ GitHub stars). We use pi as the engine, NOT OpenClaw the product. No Gateway, no 50+ integrations we don't need. Just the agentic core.

**What pi gives us (so we don't build it):**
- Agentic tool-calling loop (message → LLM → tools → execute → repeat until done)
- Context management (automatic windowing — no blowup on long conversations)
- Session persistence (save/resume to `~/.anton/sessions/`)
- Multi-model support (Claude, GPT, Gemini, Ollama, Bedrock — user picks in config)
- Real-time streaming
- Parallel tool execution
- Error recovery and retries
- AbortSignal for task cancellation

**What we build on top:**
- Custom tools (shell, filesystem, browser, process, network)
- Skills system (YAML-based AI workers, 24/7 scheduler)
- Desktop confirmation flow (dangerous commands need approval)
- WebSocket pipe to desktop app

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

// pi-ai handles ALL providers with one call
const model = getModel(config.ai.provider, config.ai.model, {
  apiKey: config.ai.apiKey,
});

const { session } = await createAgentSession({
  model,
  sessionManager: SessionManager.open("~/.anton/sessions/default.json"),
  systemPrompt: SYSTEM_PROMPT,
  customTools: [shellTool, fsTool, browserTool, processTool, networkTool],
  abortSignal: controller.signal,
});

// User sends a message from desktop app
session.subscribe(event => {
  // Stream tool calls, outputs, and responses back via WebSocket
  ws.send(encode({ pipe: "ai", data: event }));
});

await session.prompt(userMessage);
```

This gives us:
- **Tool calling loop** — LLM requests tools, pi executes them, feeds results back
- **Multi-model support** — Claude, GPT, Gemini, Ollama, any OpenAI-compatible API
- **Session persistence** — conversations survive reconnects
- **Streaming** — real-time output as the agent works

### Custom Tools (What Makes It a "Computer")

pi SDK lets us inject custom tools. These are what make the agent DO things:

| Tool | What it does | Why it matters |
|------|-------------|----------------|
| `shell` | Execute commands with timeout, streaming stdout/stderr | Deploy code, install packages, run scripts |
| `filesystem` | Read, write, search, list, watch files | Manage configs, edit code, organize data |
| `browser` | Headless Chromium via Playwright | Scrape data, test websites, fill forms |
| `process` | List, kill, monitor running processes | Manage services, debug issues |
| `network` | Port scan, HTTP requests, DNS lookup | Check connectivity, test APIs |

Each tool runs inside the **sandbox** (see below).

### Sandboxing Model

Inspired by Anthropic's Claude Code sandboxing (they open-sourced it as `@anthropic-ai/sandbox-runtime`):

```
┌─────────────────────────────────────────────┐
│  Agent Process (Node.js)                    │
│                                             │
│  Tool call: shell("apt install nginx")      │
│       │                                     │
│       ▼                                     │
│  ┌─────────────────────────────────┐        │
│  │  Sandbox Wrapper                │        │
│  │                                 │        │
│  │  Linux: bubblewrap (bwrap)      │        │
│  │  - Filesystem: deny-then-allow  │        │
│  │  - Network: namespace removed   │        │
│  │  - Seccomp: dangerous syscalls  │        │
│  │    blocked                      │        │
│  │                                 │        │
│  │  macOS: sandbox-exec (Seatbelt) │        │
│  │  - Filesystem: scoped access    │        │
│  │  - Network: localhost proxy only│        │
│  │                                 │        │
│  │  ┌───────────────────────┐      │        │
│  │  │ Command executes here │      │        │
│  │  └───────────────────────┘      │        │
│  └─────────────────────────────────┘        │
│       │                                     │
│       ▼                                     │
│  Network Proxy (allowlist-based)            │
│  - Default: deny all outbound               │
│  - Allow: github.com, npmjs.org, pypi.org   │
│  - User-configurable allowlist              │
└─────────────────────────────────────────────┘
```

**Dangerous command flow:**
1. Agent wants to run `sudo rm -rf /var/log`
2. Sandbox checks against `confirm_patterns` in config
3. Match found → emit confirmation request to desktop via event channel
4. Desktop shows native dialog: "Agent wants to run: sudo rm -rf /var/log. Allow?"
5. User approves/denies → result sent back to agent
6. If approved, command runs inside sandbox

## Pipe Protocol

All communication over a single WebSocket with multiplexed channels.

### Frame Format

```
┌──────────┬──────────┬──────────────────────────┐
│ channel  │ type     │ payload                  │
│ (1 byte) │ (1 byte) │ (variable, msgpack/JSON) │
└──────────┴──────────┴──────────────────────────┘
```

### Channels

| ID | Channel | Payload format | Description |
|----|---------|---------------|-------------|
| `0x00` | Control | JSON | Auth handshake, ping/pong, errors |
| `0x01` | Terminal | Binary (raw bytes) | PTY stdin/stdout stream |
| `0x02` | AI | JSON | Chat messages, tool calls, tool results, streaming text |
| `0x03` | FileSync | Binary + JSON header | File chunks, sync operations |
| `0x04` | Events | JSON | Agent notifications → desktop |

### Key Messages

```typescript
// Control channel
{ type: "auth", token: "abc123" }
{ type: "auth_ok", agent_id: "xyz", version: "0.1.0" }
{ type: "ping" } / { type: "pong" }

// Terminal channel
// Raw bytes — stdin from desktop, stdout from agent PTY
// Control messages use JSON:
{ type: "pty_spawn", id: "t1", cols: 120, rows: 40 }
{ type: "pty_resize", id: "t1", cols: 80, rows: 24 }
{ type: "pty_close", id: "t1" }

// AI channel
{ type: "message", content: "Deploy nginx and configure SSL" }
{ type: "thinking", text: "I'll install nginx, then use certbot..." }
{ type: "tool_call", id: "tc1", name: "shell", input: { command: "apt install -y nginx" } }
{ type: "tool_result", id: "tc1", output: "Reading package lists..." }
{ type: "text", content: "Nginx is installed. Now configuring SSL..." }
{ type: "confirm", id: "c1", command: "sudo certbot --nginx", reason: "Needs root access" }
{ type: "confirm_response", id: "c1", approved: true }
{ type: "done" }

// Event channel
{ type: "file_changed", path: "/etc/nginx/nginx.conf", change: "modified" }
{ type: "port_opened", port: 443, process: "nginx" }
{ type: "task_completed", summary: "SSL configured for example.com" }
```

## Security Model

1. **Auth**: Shared secret token generated on agent install. Desktop must present it on WebSocket handshake.
2. **TLS**: Agent generates self-signed cert on first run. Desktop pins the cert fingerprint after first connection.
3. **Sandbox**: All AI-initiated commands run inside bubblewrap/sandbox-exec. Direct terminal sessions are unsandboxed (user is in control).
4. **Network**: Sandboxed commands have no network by default. Proxy with domain allowlist for approved outbound.
5. **Confirmation**: Dangerous patterns (`rm -rf`, `sudo`, `systemctl`, `reboot`) require desktop approval.
6. **Audit**: Every AI action logged with timestamp, tool name, input, output to `~/.anton/audit.log`.
7. **No root by default**: Agent runs as a dedicated `anton` user. Sudo available but requires confirmation.

## Connection Flow

```
1. User installs agent on VPS:
   $ curl -fsSL https://get.anton.computer | bash
   → Installs Node 22, agent package
   → Generates token: "ak_7f3a2b..."
   → Starts on port 9876
   → Prints: "Connect with token: ak_7f3a2b..."

2. User opens desktop app:
   → Clicks "Add Machine"
   → Enters: IP = 1.2.3.4, Token = ak_7f3a2b...
   → Desktop connects: wss://1.2.3.4:9876

3. WebSocket handshake:
   Desktop → { channel: 0x00, type: "auth", token: "ak_7f3a2b..." }
   Agent  → { channel: 0x00, type: "auth_ok", agent_id: "xyz" }

4. Ready. Desktop shows terminal + AI chat.
```
