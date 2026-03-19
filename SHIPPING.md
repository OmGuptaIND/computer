# anton.computer — Shipping Tracker

> An open-source personal cloud computer. Install on any VPS. Connect from your desktop.
> An AI agent that doesn't just chat — it does the work. 24/7. On YOUR server.

**Status: Phase 0 — Architecture & Scaffolding**

---

## The Problem

Claude Projects is amazing for daily work. But:
1. **You can't share it** — your Claude Projects are locked to your account
2. **It can't DO things** — it chats, but can't deploy, can't install, can't monitor, can't run scripts on your infra
3. **It doesn't work 24/7** — you close the tab, the work stops
4. **Adding skills is hard** — you can't easily make "AI CMO" or "AI Content Writer" personas that run autonomously

## The Vision

anton.computer is **Claude Projects that runs on your own server, does real work, and never sleeps**.

- Drop a YAML file in `~/.anton/skills/` → you have a new AI worker (Content Writer, CMO, DevOps, Researcher)
- It runs on a $5/mo VPS, 24/7, on YOUR data
- Connect from a native desktop app to see what it's doing, give it new tasks, or just chat
- It's open source — share it, fork it, customize it, host it for your team

## Goals

1. **Ship an end-to-end AI agent** that a user can install on any cloud server (Hetzner, DigitalOcean, AWS, bare metal — anything with SSH) and connect to from a native desktop app.
2. **The agent DOES things** — not a chatbot. It executes tasks: deploys code, manages files, installs packages, monitors services, runs scripts, browses the web. This is where the money is.
3. **Skills are trivially easy to add** — drop a YAML file, get a new AI worker. AI CMO, AI Content Writer, AI DevOps — all just skill configs.
4. **24/7 autonomous operation** — skills can run on schedules. Your AI Content Writer drafts a blog post every Monday. Your Server Monitor checks health every 6 hours. Your AI Researcher scans for industry news daily.
5. **Open source, self-hosted** — no vendor lock-in. Your server, your data, your models. Share it with your team.
6. **Ship fast** — use Anthropic SDK directly. Don't reinvent agent runtimes. Focus on the product, not the plumbing.
7. **Secure by default** — sandboxed execution, network isolation, audit logging. Inspired by how Claude Code and Codex sandbox agents.

## Decisions (Locked)

| Question | Decision | Why |
|----------|----------|-----|
| Agent runtime | **pi SDK** (`@mariozechner/pi-coding-agent`) | The engine inside OpenClaw. Gives us the agentic loop, context management, session persistence, multi-model, streaming — all solved. We just inject our custom tools. Don't reinvent what 250k stars already proved works. |
| Agent language | **TypeScript / Node.js** | pi SDK is TS-native. Node 22+. Single ecosystem with desktop frontend. Ships faster than Go. |
| OpenClaw | **NOT a dependency** | We use pi SDK (the engine), not OpenClaw (the product). No Gateway, no 50+ integrations. Just the agentic core. |
| Desktop framework | **Tauri v2** (Rust + React) | Native performance, small binary, cross-platform. React frontend for fast UI iteration. |
| Sandboxing | **Anthropic's pattern** — bubblewrap (Linux) / sandbox-exec (macOS), network via proxy | Proven by Claude Code. OS-level, no container required. Network deny-by-default with proxy allowlist. |
| Protocol | **WebSocket with multiplexed channels** | Simple, works everywhere, handles binary (terminal) and JSON (AI, events) on one connection. |
| Broker | **Skip for v0.1** — direct connection only | User connects to agent IP:port. NAT traversal (broker/Tailscale) is v0.2. Keeps scope small. |
| Auth | **Shared secret (token)** generated on install | Agent generates a random token. User enters it in desktop app. Simple, secure enough for v0.1. |
| Name | **anton.computer** | |
| License | **Apache 2.0** | Max adoption for OSS. |

---

## Phase 0: Foundation ← CURRENT
- [x] Define project structure
- [x] Write architecture doc
- [x] Decide agent runtime (pi SDK)
- [x] Decide sandboxing approach (Anthropic pattern)
- [x] Lock all open questions (see table above)
- [ ] Init TypeScript monorepo (pnpm workspaces)
- [ ] Init agent package with pi SDK
- [ ] Init desktop package with Tauri v2
- [ ] Define pipe protocol message spec

## Phase 1: Agent — The Brain
> Node.js daemon on the user's VPS. Uses pi SDK for AI, custom tools for system access.

### Core (must ship)
- [ ] Agent entry point — starts WebSocket server, loads config
- [ ] pi SDK integration — `createAgentSession()` with tool injection
- [ ] Tool: shell — execute commands with timeout, streaming output
- [ ] Tool: filesystem — read, write, search, list files
- [ ] Tool: browser — headless browsing via Puppeteer/Playwright
- [ ] Tool: process — list, kill, monitor processes
- [ ] Tool: network — port scan, curl, DNS lookup
- [ ] PTY multiplexer — spawn terminal sessions, stream over WebSocket
- [ ] Config system — `~/.anton/config.yaml` (API keys, model selection, sync paths)
- [ ] Session persistence — resume conversations across reconnects

### Sandboxing
- [ ] Sandbox wrapper — bubblewrap (Linux) / sandbox-exec (macOS) for tool execution
- [ ] Network proxy — all outbound traffic through proxy with domain allowlist
- [ ] Filesystem isolation — deny-then-allow pattern for reads, scoped writes
- [ ] Dangerous command confirmation — patterns like `rm -rf`, `sudo` require desktop approval
- [ ] Audit log — every AI action logged to `~/.anton/audit.log`

### Connectivity
- [ ] WebSocket server with TLS (self-signed cert on first run)
- [ ] Multiplexed pipes — terminal, AI stream, file sync, events on one connection
- [ ] Token auth — validate shared secret on connection handshake
- [ ] Heartbeat / reconnection handling
- [ ] Event emitter — file changes, port changes, task completion → desktop notifications

## Phase 2: Desktop App — The Interface
> Tauri v2 native app. Connect to your cloud computers.

### Core (must ship)
- [x] Tauri v2 + React + Vite project setup
- [x] Connection manager — add machines by IP + token, save to localStorage
- [x] Terminal tab — xterm.js over WebSocket PTY
- [x] AI agent tab — shows agent working (tool calls, outputs, confirmation dialogs)
- [ ] System tray / menubar — connection status, quick actions
- [ ] Native notifications — agent events → OS notifications

### Nice to have (v0.2)
- [ ] File browser — remote filesystem with upload/download
- [ ] File sync — local folder ↔ remote folder bidirectional
- [ ] Apps dashboard — running ports, one-click open in browser
- [ ] Port forwarding — remote port → localhost
- [ ] Multi-machine — manage several cloud computers
- [ ] Offline queue — buffer commands, replay on reconnect

## Phase 3: Install & Deploy
- [ ] `curl -fsSL https://get.anton.computer | bash` installer
- [ ] Installs Node 22 if missing, downloads agent, generates config + token
- [ ] systemd service file for auto-start
- [ ] Docker image for the agent (alternative to bare metal install)
- [ ] cloud-init template for VPS providers (Hetzner, DO, Vultr)

## Phase 4: Ship It
- [ ] README.md — compelling narrative, GIF demo, quickstart
- [ ] docs/ — self-hosting, architecture, adding custom tools, AI backends
- [ ] GitHub Actions CI — build agent (npm), desktop (Tauri binaries), Docker image
- [ ] GitHub Releases — pre-built desktop app for macOS/Windows/Linux
- [ ] Landing page at anton.computer
- [ ] Security review checklist

---

## Dev & Test Flow (OrbStack)

This is our product testing loop — run everything locally before touching real VPS.

### 1. Start Ubuntu VM in OrbStack

```bash
# Create an Ubuntu machine in OrbStack
orb create ubuntu anton-test

# SSH into it
orb shell anton-test
```

### 2. Install agent on the Ubuntu VM

```bash
# Inside the OrbStack Ubuntu VM:
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and build the agent
git clone <repo-url> ~/anton
cd ~/anton
npm install -g pnpm
pnpm install
pnpm --filter @anton/protocol build
pnpm --filter @anton/agent build

# Set API key and start
export ANTHROPIC_API_KEY=sk-ant-...
cd packages/agent && node dist/index.js
# → Agent prints token: ak_7f3a2b...
# → Listening on wss://0.0.0.0:9876
```

### 3. Connect desktop app

```bash
# On your Mac (host machine):
cd packages/desktop
pnpm install
pnpm dev
# → Opens at http://localhost:1420

# Or build the native app:
pnpm tauri dev
```

In the app:
1. Enter Host: `anton-test.orb.local` (OrbStack gives you .orb.local DNS)
2. Enter Port: `9876`
3. Enter Token: the `ak_...` token from step 2
4. Uncheck TLS (local dev)
5. Click Connect

### 4. Test the agent

In the AI chat tab, try:
- "What OS is this? How much memory and disk space?"
- "Install nginx and start it"
- "Create a simple HTML page and serve it"
- "Check what ports are listening"

In the Terminal tab:
- Direct shell access to the VM

---

## Non-Goals for v0.1
- Multi-tenant / team features (personal computer, not platform)
- Built-in VM provisioning (BYOS — bring your own server)
- GPU scheduling / orchestration
- Mobile app
- Browser-based fallback (desktop-first)
- Broker / relay server (direct connection only)
- OpenClaw as hard dependency

## Architecture Reference

See `ARCHITECTURE.md` for:
- Component diagram
- Pipe protocol spec
- Sandboxing model
- Security model

## Prior Art

| What | How we use it |
|------|---------------|
| **pi SDK** | Agent brain — tool calling loop, session persistence, multi-model |
| **OpenClaw** | Optional power-user sidecar for 50+ integrations |
| **Anthropic sandbox-runtime** | Sandboxing pattern — bubblewrap, sandbox-exec, proxy network |
| **Codex CLI** | Sandboxing reference — Landlock, seccomp, offline-by-default |
| **Tauri v2** | Desktop app framework |
| **xterm.js** | Terminal emulator in desktop app |
| **node-pty** | PTY spawning on agent side |
