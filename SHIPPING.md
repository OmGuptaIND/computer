# AntonComputer — Shipping Tracker

> Your personal cloud computer. Self-hosted. AI-native. Open pipes to real infrastructure.

Status: **Phase 0 — Architecture & Scaffolding**

---

## Phase 0: Architecture & Foundation
- [x] Define project structure
- [x] Write architecture doc (ARCHITECTURE.md)
- [ ] Decide agent runtime strategy (OpenClaw vs custom vs hybrid)
- [ ] Define pipe protocol spec (WebSocket message format)
- [ ] Define desktop ↔ agent auth flow
- [ ] Init Go module for agent
- [ ] Init Tauri v2 project for desktop app
- [ ] Init server (lightweight broker — not full OpenStack, just relay)

## Phase 1: Agent (runs on user's VM/VPS)
> The daemon that makes a raw machine a "computer." Single Go binary, ~15MB.

- [ ] PTY multiplexer — spawn/attach/resize terminal sessions over WebSocket
- [ ] File watcher — inotify/fsnotify, emit events for changes
- [ ] File sync engine — bidirectional rsync-like protocol over WebSocket
- [ ] Port scanner — detect listening ports, expose them via reverse tunnel
- [ ] Port forwarding — TCP tunnel from VM port → client localhost
- [ ] Event bus — pubsub system (agent → desktop notifications)
- [ ] AI runtime integration — pluggable backend (see below)
- [ ] Tool registry — shell exec, filesystem ops, browser (headless), custom plugins
- [ ] Health check / heartbeat endpoint
- [ ] Auto-update mechanism
- [ ] Systemd service file + install script
- [ ] Cloud-init bootstrap script

### AI Runtime Decision
Options:
1. **Embed OpenClaw** — fork/vendor OpenClaw's agent runtime as a subprocess. It already has 50+ integrations, tool calling, memory. We just manage its lifecycle.
2. **Use OpenClaw as optional backend** — agent can connect to a running OpenClaw instance OR use a built-in lightweight tool executor
3. **Custom thin executor + LLM routing** — simple tool calling loop (shell, fs, browser) that talks to Claude/GPT/Ollama APIs directly. Lighter than OpenClaw, fewer features.

**Recommendation**: Option 2 — ship a thin built-in executor for v0.1 (just shell + fs + AI chat), but make OpenClaw a first-class "engine" you can swap in. This way:
- Works out of the box without OpenClaw
- Power users can plug in OpenClaw for the full agent ecosystem
- We don't depend on OpenClaw's release cycle

## Phase 2: Connection Layer (Pipe Broker)
> Lightweight relay server that brokers WebSocket connections between desktop ↔ agent.

- [ ] WebSocket relay server (Go or Rust)
- [ ] Auth: token-based, issued when agent registers with broker
- [ ] Pipe types: terminal, filesync, ai_stream, port_fwd, events
- [ ] Direct connection mode (no broker — desktop connects to agent directly via IP/WireGuard)
- [ ] NAT traversal / STUN/TURN for agents behind firewalls
- [ ] TLS everywhere
- [ ] Connection multiplexing (single WS conn, multiple logical pipes)
- [ ] Reconnection / resume on network interruption

## Phase 3: Desktop App (Tauri v2)
> Native app. macOS first, then Windows/Linux.

- [ ] Tauri v2 project setup (Rust backend + web frontend)
- [ ] Connection manager — add machines by IP, token, or broker discovery
- [ ] Terminal tab — xterm.js over WebSocket PTY pipe
- [ ] File browser — browse remote FS, drag-drop upload/download
- [ ] File sync — select local folder ↔ remote folder, bidirectional
- [ ] AI chat tab — stream conversation with agent's AI runtime
- [ ] Apps/services tab — see running ports, one-click open in browser
- [ ] System tray / menubar icon — status, quick connect, notifications
- [ ] Notifications — agent events → native OS notifications
- [ ] Settings — machine list, AI model config, sync preferences
- [ ] Offline queue — buffer commands when disconnected, replay on reconnect
- [ ] Multi-machine support — manage multiple cloud computers from one app

## Phase 4: VM Images & One-Command Deploy
- [ ] Packer config for base image (Ubuntu 24.04 + agent pre-installed)
- [ ] Packer config for dev image (+ Node, Python, Go, Docker, Ollama)
- [ ] Packer config for AI image (+ GPU drivers, CUDA, vLLM)
- [ ] cloud-init template for bootstrapping agent on any VPS
- [ ] `curl | bash` installer for existing machines
- [ ] Docker image for the broker/server
- [ ] docker-compose.yml for self-hosted broker + dashboard

## Phase 5: Polish & Ship
- [ ] README.md with compelling narrative
- [ ] docs/ — self-hosting guide, architecture, adding AI backends, building tools
- [ ] Demo video / GIF
- [ ] GitHub Actions CI — build agent binary, desktop app, Docker images
- [ ] Release automation — GitHub Releases with pre-built binaries
- [ ] Landing page (optional, can be README-only for v0.1)
- [ ] License decision (Apache 2.0 or AGPLv3)
- [ ] Security audit checklist (agent runs as root, needs sandboxing review)

---

## Open Questions
1. **Agent runtime**: Do we embed OpenClaw, use it as a sidecar, or build a thin custom executor? (see Phase 1 notes)
2. **Broker necessity**: For v0.1, do we even need a broker? Users can connect directly to their VPS via IP. Broker adds complexity but solves NAT/firewall issues.
3. **Auth model**: JWT issued by broker? SSH key-based? WireGuard mesh?
4. **Desktop framework**: Tauri v2 (Rust+web) vs Electron (heavier but more mature) vs Swift-only (macOS only)?
5. **Protocol**: Custom binary protocol over WebSocket? Or use existing like Mosh (for terminal), Syncthing (for files)?
6. **Name**: antoncomputer, anton.computer, or something else for the OSS project?

---

## Non-Goals for v0.1
- Multi-tenant / team features (this is personal computer, not platform)
- Built-in VM provisioning (user brings their own VPS)
- GPU scheduling / orchestration
- Mobile app
- Browser-based fallback (desktop-first)

---

## Dependencies & Prior Art to Study
| What | Why |
|------|-----|
| OpenClaw | Agent runtime, tool calling, integrations |
| Warp terminal | Desktop terminal UX reference |
| Syncthing | Bidirectional file sync protocol |
| Tailscale / WireGuard | Secure tunneling without broker |
| Mosh | Resilient terminal protocol |
| VS Code Remote | Remote dev UX patterns |
| Tauri v2 | Desktop app framework |
| xterm.js | Terminal emulator for web |
